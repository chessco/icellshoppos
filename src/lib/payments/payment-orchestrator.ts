/**
 * Pro Buyer POS Payment System - Payment Orchestrator Service
 *
 * Authoritative backend payment orchestrator for Pro Buyer POS.
 * Handles the unified payment lifecycle across both physical channels:
 *  - STRIPE_READER (iPad + Physical Reader)
 *  - STRIPE_TAP_TO_PAY_IPHONE (iPhone Tap to Pay)
 *
 * Responsibilities:
 *  - Organization multi-tenant isolation
 *  - Backend authoritative amount calculation & validation
 *  - Connection token issuance for mobile Terminal SDKs
 *  - Card-present PaymentIntent creation with full trace metadata
 *  - Direct Stripe verification to resolve UNKNOWN states safely
 *  - PaymentIntent cancellation
 *  - Idempotent Stripe webhook ingestion & ledger reconciliation
 *  - Orphan payment detection and auditability
 */

import { db as defaultDb } from "@/lib/db";
import { PrismaClient, PosPaymentStatus, PaymentAttemptStatus, PosPaymentMethod, PaymentChannel } from "@prisma/client";
import {
  CreatePaymentIntentParams,
  PaymentIntentResult,
  VerifyPaymentStatusParams,
  PaymentVerificationResult,
  CancelPaymentIntentParams,
  StripeMetadataPayload,
} from "./types";
import {
  assertValidPaymentTransition,
  assertValidAttemptTransition,
  mapStripeIntentStatusToPaymentStatus,
  mapStripeIntentStatusToAttemptStatus,
} from "./state-machine";
import {
  validateChargeAmount,
  calculateAuthoritativeCartTotal,
  validateSplitPayments,
  PaymentValidationError,
} from "./validation";
import { IStripePaymentAdapter, defaultStripeAdapter } from "./stripe-adapter";
import { logAudit } from "@/lib/audit-log";

export class PaymentOrchestrator {
  constructor(
    private readonly db: PrismaClient = defaultDb,
    private readonly stripeAdapter: IStripePaymentAdapter = defaultStripeAdapter
  ) {}

  /**
   * Generates a short-lived Connection Token for the React Native Terminal SDK
   */
  async createConnectionToken(params: {
    organizationId: string;
    userId: string;
    posDeviceId?: string;
  }): Promise<{ secret: string }> {
    const { organizationId, userId, posDeviceId } = params;

    // Verify tenant organization
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });

    if (!org || org.status !== "active") {
      throw new Error("Organization not found or inactive.");
    }

    // If posDeviceId provided, verify it belongs to this org and update lastSeenAt
    if (posDeviceId) {
      await this.db.pOSDevice.updateMany({
        where: { id: posDeviceId, organizationId },
        data: { lastSeenAt: new Date() },
      });
    }

    const result = await this.stripeAdapter.createConnectionToken();

    await logAudit({
      organizationId,
      actorUserId: userId,
      action: "create",
      entity: "stripe_connection_token",
      meta: { posDeviceId },
    });

    return result;
  }

  /**
   * Creates a card-present PaymentIntent with strict backend amount validation and idempotency
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const {
      organizationId,
      userId,
      saleId,
      amount,
      currency = "mxn",
      channel,
      posDeviceId,
      stripeReaderId,
      idempotencyKey,
      notes,
      cartContext,
    } = params;

    if (!organizationId || !userId || !idempotencyKey) {
      throw new PaymentValidationError(
        "Missing required parameters: organizationId, userId, and idempotencyKey are mandatory.",
        "MISSING_PARAMETERS"
      );
    }

    // 1. Idempotency Check: if a PosPayment already exists with this idempotencyKey for this org, replay it
    const existingPayment = await this.db.posPayment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
      include: {
        stripePayment: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (existingPayment) {
      const latestAttempt = existingPayment.attempts[0];
      const stripeRecord = existingPayment.stripePayment;

      return {
        success: true,
        posPaymentId: existingPayment.id,
        paymentAttemptId: latestAttempt?.id || "",
        stripePaymentIntentId: stripeRecord?.stripePaymentIntentId || latestAttempt?.stripePaymentIntentId || "",
        clientSecret: "", // Client secret cannot be retrieved after creation from DB alone; client uses paymentIntentId
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency,
        status: existingPayment.status,
        channel: existingPayment.paymentChannel,
        idempotentReplay: true,
      };
    }

    // 2. Validate authoritative amount
    let authoritativeAmount = amount;

    if (cartContext && cartContext.items.length > 0) {
      const cartCalc = calculateAuthoritativeCartTotal(cartContext.items, cartContext.discount);
      authoritativeAmount = cartCalc.total;
    }

    const money = validateChargeAmount(authoritativeAmount, currency);

    // 3. If attached to a Sale, validate split payment limits
    if (saleId) {
      const sale = await this.db.sale.findFirst({
        where: { id: saleId, organizationId },
        include: { posPayments: true },
      });

      if (!sale) {
        throw new PaymentValidationError(
          `Sale with ID "${saleId}" not found in this organization.`,
          "SALE_NOT_FOUND"
        );
      }

      validateSplitPayments(Number(sale.total), sale.posPayments, money.decimalAmount);
    }

    // 4. Verify POS Device belongs to tenant if provided
    if (posDeviceId) {
      const device = await this.db.pOSDevice.findFirst({
        where: { id: posDeviceId, organizationId },
      });
      if (!device) {
        throw new PaymentValidationError(
          `POS device "${posDeviceId}" does not belong to this organization.`,
          "DEVICE_ORG_MISMATCH"
        );
      }
    }

    // 5. Verify Stripe Reader belongs to tenant if provided
    if (stripeReaderId) {
      const reader = await this.db.stripeReader.findFirst({
        where: { id: stripeReaderId, organizationId },
      });
      if (!reader) {
        throw new PaymentValidationError(
          `Stripe reader "${stripeReaderId}" does not belong to this organization.`,
          "READER_ORG_MISMATCH"
        );
      }
    }

    // 6. Create PosPayment & Initial PaymentAttempt in DB before calling Stripe (Order Critical)
    let posPayment: any;
    let paymentAttempt: any;

    try {
      posPayment = await this.db.posPayment.create({
        data: {
          organizationId,
          saleId: saleId || null,
          posDeviceId: posDeviceId || null,
          paymentMethod: PosPaymentMethod.CARD,
          paymentChannel: channel,
          amount: money.decimalAmount,
          currency: money.currency.toUpperCase(),
          status: PosPaymentStatus.CREATED,
          idempotencyKey,
          notes: notes || null,
          createdByUserId: userId,
        },
      });

      paymentAttempt = await this.db.paymentAttempt.create({
        data: {
          paymentId: posPayment.id,
          attemptNumber: 1,
          channel,
          status: PaymentAttemptStatus.CREATED,
          idempotencyKey: `att_${posPayment.id}_1`,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === "P2002") {
        const existingAfterRace = await this.db.posPayment.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId,
              idempotencyKey,
            },
          },
          include: {
            stripePayment: true,
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
            },
          },
        });

        if (existingAfterRace) {
          const latestAttempt = existingAfterRace.attempts[0];
          const stripeRecord = existingAfterRace.stripePayment;

          return {
            success: true,
            posPaymentId: existingAfterRace.id,
            paymentAttemptId: latestAttempt?.id || "",
            stripePaymentIntentId: stripeRecord?.stripePaymentIntentId || latestAttempt?.stripePaymentIntentId || "",
            clientSecret: "",
            amount: Number(existingAfterRace.amount),
            currency: existingAfterRace.currency,
            status: existingAfterRace.status,
            channel: existingAfterRace.paymentChannel,
            idempotentReplay: true,
          };
        }
      }
      throw createErr;
    }

    // 7. Call Stripe to create card-present PaymentIntent
    const stripeMetadata: StripeMetadataPayload = {
      organizationId,
      saleId: saleId || undefined,
      posPaymentId: posPayment.id,
      paymentAttemptId: paymentAttempt.id,
      posDeviceId: posDeviceId || undefined,
      paymentChannel: channel,
      environment: process.env.NODE_ENV || "development",
    };

    let stripeIntent;
    try {
      stripeIntent = await this.stripeAdapter.createPaymentIntent({
        amountCents: money.amountCents,
        currency: money.currency,
        metadata: stripeMetadata,
        idempotencyKey: paymentAttempt.idempotencyKey,
      });
    } catch (stripeError) {
      // Mark attempt as FAILED if Stripe rejected creation
      await this.db.paymentAttempt.update({
        where: { id: paymentAttempt.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          failureMessage: stripeError instanceof Error ? stripeError.message : String(stripeError),
        },
      });

      await this.db.posPayment.update({
        where: { id: posPayment.id },
        data: { status: PosPaymentStatus.FAILED },
      });

      throw stripeError;
    }

    // 8. Persist StripePaymentRecord and update Attempt to PROCESSING
    await this.db.stripePaymentRecord.create({
      data: {
        organizationId,
        posPaymentId: posPayment.id,
        paymentAttemptId: paymentAttempt.id,
        stripeReaderId: stripeReaderId || null,
        stripePaymentIntentId: stripeIntent.id,
        stripeCustomerId: typeof stripeIntent.customer === "string" ? stripeIntent.customer : null,
        amount: money.decimalAmount,
        currency: money.currency.toUpperCase(),
        status: stripeIntent.status,
        channel,
        metadataJson: stripeIntent.metadata as any,
      },
    });

    await this.db.paymentAttempt.update({
      where: { id: paymentAttempt.id },
      data: {
        stripePaymentIntentId: stripeIntent.id,
        status: PaymentAttemptStatus.PROCESSING,
        rawResponseJson: {
          id: stripeIntent.id,
          status: stripeIntent.status,
          client_secret: stripeIntent.client_secret,
        } as any,
      },
    });

    await this.db.posPayment.update({
      where: { id: posPayment.id },
      data: { status: PosPaymentStatus.PROCESSING },
    });

    return {
      success: true,
      posPaymentId: posPayment.id,
      paymentAttemptId: paymentAttempt.id,
      stripePaymentIntentId: stripeIntent.id,
      clientSecret: stripeIntent.client_secret || "",
      amount: money.decimalAmount,
      currency: money.currency.toUpperCase(),
      status: PosPaymentStatus.PROCESSING,
      channel,
      idempotentReplay: false,
    };
  }

  /**
   * Queries Stripe directly to authoritatively resolve UNKNOWN or pending payment states
   */
  async verifyPaymentStatus(params: VerifyPaymentStatusParams): Promise<PaymentVerificationResult> {
    const { organizationId, paymentIntentId, paymentAttemptId, posPaymentId } = params;

    if (!organizationId || (!paymentIntentId && !paymentAttemptId && !posPaymentId)) {
      throw new PaymentValidationError(
        "organizationId and at least one payment identifier are required.",
        "MISSING_PARAMETERS"
      );
    }

    // 1. Locate local records in DB
    const posPayment = await this.db.posPayment.findFirst({
      where: {
        organizationId,
        ...(posPaymentId ? { id: posPaymentId } : {}),
        ...(paymentAttemptId ? { attempts: { some: { id: paymentAttemptId } } } : {}),
        ...(paymentIntentId ? { stripePayment: { stripePaymentIntentId: paymentIntentId } } : {}),
      },
      include: {
        stripePayment: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!posPayment || !posPayment.stripePayment) {
      throw new PaymentValidationError(
        "Payment record not found for the provided identifier within this organization.",
        "PAYMENT_NOT_FOUND"
      );
    }

    const stripeRecord = posPayment.stripePayment;
    const latestAttempt = posPayment.attempts[0];

    // 2. Authoritative lookup on Stripe API Cloud
    const stripeIntent = await this.stripeAdapter.retrievePaymentIntent(stripeRecord.stripePaymentIntentId);

    // 3. Map status authoritatively
    const mappedPaymentStatus = mapStripeIntentStatusToPaymentStatus(stripeIntent.status);
    const mappedAttemptStatus = mapStripeIntentStatusToAttemptStatus(stripeIntent.status);

    // Extract card brand & last4 if charge exists
    const charge = typeof stripeIntent.latest_charge === "object" ? stripeIntent.latest_charge : null;
    const paymentMethodDetails = charge?.payment_method_details;
    const cardPresent = paymentMethodDetails?.card_present;

    const cardBrand = cardPresent?.brand || paymentMethodDetails?.card?.brand || null;
    const cardLast4 = cardPresent?.last4 || paymentMethodDetails?.card?.last4 || null;
    const cardEntryMethod = cardPresent?.read_method || null;
    const receiptUrl = charge?.receipt_url || null;

    // 4. Update local records with authoritative Stripe state
    if (posPayment.status !== mappedPaymentStatus) {
      assertValidPaymentTransition(posPayment.status, mappedPaymentStatus);
      await this.db.posPayment.update({
        where: { id: posPayment.id },
        data: { status: mappedPaymentStatus },
      });
    }

    if (latestAttempt && latestAttempt.status !== mappedAttemptStatus) {
      assertValidAttemptTransition(latestAttempt.status, mappedAttemptStatus);
      await this.db.paymentAttempt.update({
        where: { id: latestAttempt.id },
        data: {
          status: mappedAttemptStatus,
          rawResponseJson: {
            status: stripeIntent.status,
            charges: stripeIntent.latest_charge ? [stripeIntent.latest_charge] : [],
          } as any,
        },
      });
    }

    await this.db.stripePaymentRecord.update({
      where: { id: stripeRecord.id },
      data: {
        status: stripeIntent.status,
        stripeChargeId: typeof stripeIntent.latest_charge === "string" ? stripeIntent.latest_charge : charge?.id || null,
        cardBrand,
        cardLast4,
        cardEntryMethod,
        receiptUrl,
        metadataJson: stripeIntent.metadata as any,
      },
    });

    // 5. Synchronize any active cross-device PaymentHandoff linked to this PosPayment
    try {
      const activeHandoff = await this.db.paymentHandoff.findFirst({
        where: {
          posPaymentId: posPayment.id,
          status: {
            in: [
              "CREATED",
              "WAITING_FOR_DEVICE",
              "ASSIGNED",
              "ACCEPTED",
              "PAYMENT_PROCESSING",
              "VERIFYING",
              "UNKNOWN",
            ],
          },
        },
      });

      if (activeHandoff) {
        let handoffStatus = activeHandoff.status;
        if (mappedPaymentStatus === PosPaymentStatus.SUCCEEDED) {
          handoffStatus = "SUCCEEDED";
        } else if (mappedPaymentStatus === PosPaymentStatus.FAILED) {
          handoffStatus = "FAILED";
        } else if (mappedPaymentStatus === PosPaymentStatus.CANCELED) {
          handoffStatus = "CANCELED";
        } else if (mappedPaymentStatus === PosPaymentStatus.UNKNOWN) {
          handoffStatus = "UNKNOWN";
        }

        if (handoffStatus !== activeHandoff.status) {
          await this.db.paymentHandoff.update({
            where: { id: activeHandoff.id },
            data: {
              status: handoffStatus,
              completedAt: handoffStatus === "SUCCEEDED" ? new Date() : undefined,
              canceledAt: (handoffStatus === "CANCELED" || handoffStatus === "FAILED") ? new Date() : undefined,
              version: { increment: 1 },
            },
          });
        }
      }
    } catch {
      // Non-fatal if handoff model not queried
    }

    // 6. Check if this is an orphan payment (Payment succeeded on Stripe but no Sale attached locally)
    const isOrphan = mappedPaymentStatus === PosPaymentStatus.SUCCEEDED && !posPayment.saleId;

    return {
      success: true,
      posPaymentId: posPayment.id,
      paymentAttemptId: latestAttempt?.id,
      stripePaymentIntentId: stripeRecord.stripePaymentIntentId,
      status: mappedPaymentStatus,
      attemptStatus: mappedAttemptStatus,
      amount: Number(posPayment.amount),
      currency: posPayment.currency,
      cardBrand,
      cardLast4,
      cardEntryMethod,
      isOrphan,
      saleId: posPayment.saleId,
      message: isOrphan
        ? "Payment succeeded on Stripe but is not yet attached to a completed Sale (Pending Finalization)."
        : `Payment is in state ${mappedPaymentStatus}.`,
    };
  }

  /**
   * Cancels an open PaymentIntent on Stripe and marks local payment as CANCELED
   */
  async cancelPaymentIntent(params: CancelPaymentIntentParams): Promise<{ success: boolean; status: string }> {
    const { organizationId, paymentIntentId, posPaymentId, reason } = params;

    const posPayment = await this.db.posPayment.findFirst({
      where: {
        organizationId,
        ...(posPaymentId ? { id: posPaymentId } : {}),
        ...(paymentIntentId ? { stripePayment: { stripePaymentIntentId: paymentIntentId } } : {}),
      },
      include: {
        stripePayment: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!posPayment || !posPayment.stripePayment) {
      throw new PaymentValidationError(
        "Payment not found for cancellation.",
        "PAYMENT_NOT_FOUND"
      );
    }

    const stripeRecord = posPayment.stripePayment;
    const latestAttempt = posPayment.attempts[0];

    // Attempt cancellation on Stripe
    let canceledIntent;
    try {
      canceledIntent = await this.stripeAdapter.cancelPaymentIntent(stripeRecord.stripePaymentIntentId, reason);
    } catch (err) {
      console.warn("[payment-orchestrator] Stripe cancel intent error:", err);
      throw err;
    }

    // Update local states
    assertValidPaymentTransition(posPayment.status, PosPaymentStatus.CANCELED);
    await this.db.posPayment.update({
      where: { id: posPayment.id },
      data: { status: PosPaymentStatus.CANCELED },
    });

    if (latestAttempt) {
      assertValidAttemptTransition(latestAttempt.status, PaymentAttemptStatus.CANCELED);
      await this.db.paymentAttempt.update({
        where: { id: latestAttempt.id },
        data: { status: PaymentAttemptStatus.CANCELED },
      });
    }

    await this.db.stripePaymentRecord.update({
      where: { id: stripeRecord.id },
      data: { status: canceledIntent.status },
    });

    return { success: true, status: "canceled" };
  }

  /**
   * Ingests and processes Stripe Webhooks idempotently
   */
  async processWebhookEvent(params: {
    rawBody: string | Buffer;
    signature: string;
    secret?: string;
  }): Promise<{ received: boolean; eventId: string; processed: boolean; error?: string }> {
    const { rawBody, signature, secret } = params;

    // 1. Signature Verification
    const event = this.stripeAdapter.constructWebhookEvent(rawBody, signature, secret);

    // 2. Idempotency Check in StripeWebhookEvent table
    const existingEvent = await this.db.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existingEvent && existingEvent.processed) {
      return { received: true, eventId: event.id, processed: true };
    }

    // Record webhook event in DB
    const webhookRecord = existingEvent || (await this.db.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        payloadJson: event as any,
        processed: false,
      },
    }));

    try {
      // 3. Event Processing Routing
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object as any;
          const stripeRecord = await this.db.stripePaymentRecord.findUnique({
            where: { stripePaymentIntentId: intent.id },
            include: { posPayment: true, paymentAttempt: true },
          });

          if (stripeRecord) {
            await this.db.stripeWebhookEvent.update({
              where: { id: webhookRecord.id },
              data: { organizationId: stripeRecord.organizationId },
            });

            if (stripeRecord.posPayment.status !== PosPaymentStatus.SUCCEEDED) {
              await this.db.posPayment.update({
                where: { id: stripeRecord.posPaymentId },
                data: { status: PosPaymentStatus.SUCCEEDED },
              });
            }

            if (stripeRecord.paymentAttemptId) {
              await this.db.paymentAttempt.update({
                where: { id: stripeRecord.paymentAttemptId },
                data: { status: PaymentAttemptStatus.SUCCEEDED },
              });
            }

            await this.db.stripePaymentRecord.update({
              where: { id: stripeRecord.id },
              data: { status: intent.status },
            });
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const intent = event.data.object as any;
          const stripeRecord = await this.db.stripePaymentRecord.findUnique({
            where: { stripePaymentIntentId: intent.id },
          });

          if (stripeRecord) {
            await this.db.posPayment.update({
              where: { id: stripeRecord.posPaymentId },
              data: { status: PosPaymentStatus.FAILED },
            });

            if (stripeRecord.paymentAttemptId) {
              await this.db.paymentAttempt.update({
                where: { id: stripeRecord.paymentAttemptId },
                data: {
                  status: PaymentAttemptStatus.FAILED,
                  failureMessage: intent.last_payment_error?.message || "Payment failed",
                  failureCode: intent.last_payment_error?.code || null,
                },
              });
            }
          }
          break;
        }

        case "payment_intent.canceled": {
          const intent = event.data.object as any;
          const stripeRecord = await this.db.stripePaymentRecord.findUnique({
            where: { stripePaymentIntentId: intent.id },
          });

          if (stripeRecord) {
            await this.db.posPayment.update({
              where: { id: stripeRecord.posPaymentId },
              data: { status: PosPaymentStatus.CANCELED },
            });

            if (stripeRecord.paymentAttemptId) {
              await this.db.paymentAttempt.update({
                where: { id: stripeRecord.paymentAttemptId },
                data: { status: PaymentAttemptStatus.CANCELED },
              });
            }
          }
          break;
        }
      }

      // Mark webhook event processed
      await this.db.stripeWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      return { received: true, eventId: event.id, processed: true };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.db.stripeWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: { error: errorMessage },
      });
      return { received: true, eventId: event.id, processed: false, error: errorMessage };
    }
  }

  /**
   * Retrieves orphan payments (succeeded on Stripe but without attached completed Sale) for reconciliation
   */
  async getOrphanPayments(organizationId: string) {
    return await this.db.posPayment.findMany({
      where: {
        organizationId,
        status: PosPaymentStatus.SUCCEEDED,
        saleId: null,
      },
      include: {
        stripePayment: true,
        posDevice: true,
        createdByUser: {
          select: { id: true, email: true, fullName: true },
        },
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const defaultPaymentOrchestrator = new PaymentOrchestrator();
