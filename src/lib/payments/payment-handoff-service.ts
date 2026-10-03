/**
 * Pro Buyer POS Payment System - Payment Handoff Service
 *
 * Authoritative cross-device payment orchestrator (iPad POS <-> iPhone Tap to Pay).
 *
 * Responsibilities:
 * - Multi-tenant isolation & site boundary validation
 * - POSDevice authorization & target device verification (IPHONE_TAP_TO_PAY)
 * - Atomic handoff creation, assignment, and concurrency control
 * - TTL expiration management
 * - Synchronization with PosPayment, PaymentAttempt, and Stripe PaymentIntent
 * - Safe cancellation and rejection without orphaned charges
 */

import { db as defaultDb } from "@/lib/db";
import {
  PrismaClient,
  PaymentHandoffStatus,
  POSDeviceType,
  PaymentChannel,
  PosPaymentStatus,
  PaymentAttemptStatus,
} from "@prisma/client";
import { assertValidHandoffTransition } from "./state-machine";
import { PaymentValidationError } from "./validation";
import { resolvePaymentCapabilities } from "./payment-capabilities";
import { PaymentOrchestrator } from "./payment-orchestrator";
import type {
  IPaymentHandoffInfo,
  IAvailableTargetDevice,
} from "../../../packages/contracts/src/payments";
import { logAudit } from "@/lib/audit-log";

export interface CreateHandoffParams {
  organizationId: string;
  userId: string;
  siteId?: string | null;
  saleId?: string | null;
  sourceDeviceId?: string | null;
  targetDeviceId?: string | null;
  amount: number;
  currency?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface AcceptHandoffParams {
  organizationId: string;
  userId: string;
  handoffId: string;
  targetDeviceId?: string | null;
}

export interface RejectHandoffParams {
  organizationId: string;
  userId: string;
  handoffId: string;
  targetDeviceId?: string | null;
  reason?: string;
}

export interface CancelHandoffParams {
  organizationId: string;
  userId: string;
  handoffId: string;
  reason?: string;
}

export class PaymentHandoffService {
  constructor(
    private readonly db: PrismaClient = defaultDb,
    private readonly orchestrator: PaymentOrchestrator = new PaymentOrchestrator(defaultDb)
  ) {}

  /**
   * Creates an authoritative PaymentHandoff from an iPad POS
   */
  async createHandoff(params: CreateHandoffParams): Promise<{
    handoff: IPaymentHandoffInfo;
    clientSecret?: string;
    stripePaymentIntentId?: string;
  }> {
    const {
      organizationId,
      userId,
      siteId,
      saleId,
      sourceDeviceId,
      targetDeviceId,
      amount,
      currency = "mxn",
      idempotencyKey,
      notes,
    } = params;

    if (!organizationId || !userId) {
      throw new PaymentValidationError("Organization and User are required.", "UNAUTHORIZED");
    }

    if (amount <= 0) {
      throw new PaymentValidationError("Amount must be greater than zero.", "INVALID_AMOUNT");
    }

    // 1. Verify Payment Capabilities for Organization and Site
    const capabilities = await resolvePaymentCapabilities(
      this.db,
      organizationId,
      siteId || undefined
    );

    if (!capabilities.tapToPayIPhoneEnabled) {
      throw new PaymentValidationError(
        "Stripe Tap to Pay on iPhone is not enabled for this site or organization.",
        "CAPABILITY_DISABLED"
      );
    }

    // 2. Validate Source POS Device if supplied
    if (sourceDeviceId) {
      const sourceDevice = await this.db.pOSDevice.findFirst({
        where: { id: sourceDeviceId, organizationId },
      });
      if (!sourceDevice || sourceDevice.status === "INACTIVE") {
        throw new PaymentValidationError(
          "Source POS device is not authorized or active.",
          "INVALID_SOURCE_DEVICE"
        );
      }
    }

    // 3. Validate Target iPhone POS Device if supplied
    let targetDevice = null;
    if (targetDeviceId) {
      targetDevice = await this.db.pOSDevice.findFirst({
        where: {
          id: targetDeviceId,
          organizationId,
          ...(siteId ? { siteId } : {}),
        },
      });

      if (!targetDevice || targetDevice.status === "INACTIVE") {
        throw new PaymentValidationError(
          "Target iPhone device is not found, active, or belongs to another site.",
          "INVALID_TARGET_DEVICE"
        );
      }

      if (targetDevice.deviceType !== POSDeviceType.IPHONE_TAP_TO_PAY) {
        throw new PaymentValidationError(
          "Target device must be an authorized iPhone with Tap to Pay support.",
          "INVALID_TARGET_DEVICE_TYPE"
        );
      }
    }

    // 4. Idempotency Check
    if (idempotencyKey) {
      const existing = await this.db.paymentHandoff.findFirst({
        where: { organizationId, idempotencyKey },
        include: {
          sourceDevice: true,
          targetDevice: true,
          sale: true,
          posPayment: {
            include: {
              stripePayment: true,
              attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
            },
          },
        },
      });

      if (existing) {
        const latestAttempt = existing.posPayment.attempts[0];
        const rawJson = latestAttempt?.rawResponseJson as any;
        return {
          handoff: this.mapToInfo(existing),
          clientSecret: rawJson?.client_secret || "",
          stripePaymentIntentId: latestAttempt?.stripePaymentIntentId || undefined,
        };
      }
    }

    // 5. Create Backend PaymentIntent & PosPayment (Channel = STRIPE_TAP_TO_PAY_IPHONE)
    const paymentIntentResult = await this.orchestrator.createPaymentIntent({
      organizationId,
      userId,
      saleId: saleId || undefined,
      amount,
      currency,
      channel: PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE,
      posDeviceId: targetDeviceId || sourceDeviceId || undefined,
      idempotencyKey: idempotencyKey || `handoff_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      notes: notes || `iPad to iPhone Handoff`,
    });

    // 6. Create PaymentHandoff record with 3-minute TTL
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const initialStatus = targetDeviceId
      ? PaymentHandoffStatus.ASSIGNED
      : PaymentHandoffStatus.WAITING_FOR_DEVICE;

    let handoff: any;
    try {
      handoff = await this.db.paymentHandoff.create({
        data: {
          organizationId,
          siteId: siteId || null,
          saleId: saleId || null,
          posPaymentId: paymentIntentResult.posPaymentId,
          paymentAttemptId: paymentIntentResult.paymentAttemptId,
          sourceDeviceId: sourceDeviceId || null,
          targetDeviceId: targetDeviceId || null,
          requestedByUserId: userId,
          channel: PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE,
          amount,
          currency: currency.toUpperCase(),
          status: initialStatus,
          expiresAt,
          idempotencyKey: idempotencyKey || null,
        },
        include: {
          sourceDevice: true,
          targetDevice: true,
          sale: true,
          posPayment: {
            include: {
              stripePayment: true,
            },
          },
        },
      });
    } catch (createError: any) {
      // If concurrent request created with same idempotencyKey (Prisma P2002)
      if (createError?.code === "P2002" && idempotencyKey) {
        const existing = await this.db.paymentHandoff.findFirst({
          where: { organizationId, idempotencyKey },
          include: {
            sourceDevice: true,
            targetDevice: true,
            sale: true,
            posPayment: {
              include: {
                stripePayment: true,
                attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
              },
            },
          },
        });
        if (existing) {
          const latestAttempt = existing.posPayment.attempts[0];
          const rawJson = latestAttempt?.rawResponseJson as any;
          return {
            handoff: this.mapToInfo(existing),
            clientSecret: rawJson?.client_secret || paymentIntentResult.clientSecret || "",
            stripePaymentIntentId: latestAttempt?.stripePaymentIntentId || paymentIntentResult.stripePaymentIntentId,
          };
        }
      }
      throw createError;
    }

    try {
      await logAudit({
        organizationId,
        actorUserId: userId,
        action: "CREATE_PAYMENT_HANDOFF",
        entity: "PaymentHandoff",
        entityId: handoff.id,
        meta: {
          amount,
          targetDeviceId,
          sourceDeviceId,
          status: initialStatus,
          paymentIntentId: paymentIntentResult.stripePaymentIntentId,
        },
      });
    } catch {
      // Non-fatal audit log
    }

    return {
      handoff: this.mapToInfo(handoff, paymentIntentResult.clientSecret, paymentIntentResult.stripePaymentIntentId),
      clientSecret: paymentIntentResult.clientSecret,
      stripePaymentIntentId: paymentIntentResult.stripePaymentIntentId,
    };
  }

  /**
   * Retrieves authoritative status for a single PaymentHandoff
   */
  async getHandoff(params: { organizationId: string; handoffId: string }): Promise<IPaymentHandoffInfo> {
    const { organizationId, handoffId } = params;

    const handoff = await this.db.paymentHandoff.findFirst({
      where: { id: handoffId, organizationId },
      include: {
        sourceDevice: true,
        targetDevice: true,
        sale: true,
        posPayment: {
          include: {
            stripePayment: true,
            attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!handoff) {
      throw new PaymentValidationError("Payment handoff not found.", "NOT_FOUND");
    }

    // Auto-expire if past TTL and still in pre-acceptance state (Atomic CAS update)
    const now = new Date();
    if (
      handoff.expiresAt < now &&
      (handoff.status === PaymentHandoffStatus.CREATED ||
        handoff.status === PaymentHandoffStatus.WAITING_FOR_DEVICE ||
        handoff.status === PaymentHandoffStatus.ASSIGNED)
    ) {
      await this.db.paymentHandoff.updateMany({
        where: {
          id: handoff.id,
          organizationId,
          status: {
            in: [
              PaymentHandoffStatus.CREATED,
              PaymentHandoffStatus.WAITING_FOR_DEVICE,
              PaymentHandoffStatus.ASSIGNED,
            ],
          },
        },
        data: { status: PaymentHandoffStatus.EXPIRED },
      });

      const reloaded = await this.db.paymentHandoff.findUnique({
        where: { id: handoff.id },
        include: {
          sourceDevice: true,
          targetDevice: true,
          sale: true,
          posPayment: {
            include: {
              stripePayment: true,
              attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
            },
          },
        },
      });
      return this.mapToInfo(reloaded || handoff);
    }

    const latestAttempt = handoff.posPayment.attempts[0];
    const rawJson = latestAttempt?.rawResponseJson as any;

    return this.mapToInfo(
      handoff,
      rawJson?.client_secret,
      handoff.posPayment.stripePayment?.stripePaymentIntentId || latestAttempt?.stripePaymentIntentId || null
    );
  }

  /**
   * Lists pending / assigned handoffs for a target device or site
   */
  async getPendingHandoffs(params: {
    organizationId: string;
    siteId?: string | null;
    targetDeviceId?: string | null;
  }): Promise<IPaymentHandoffInfo[]> {
    const { organizationId, siteId, targetDeviceId } = params;

    const activeStatuses: PaymentHandoffStatus[] = [
      PaymentHandoffStatus.WAITING_FOR_DEVICE,
      PaymentHandoffStatus.ASSIGNED,
      PaymentHandoffStatus.ACCEPTED,
      PaymentHandoffStatus.PAYMENT_PROCESSING,
      PaymentHandoffStatus.VERIFYING,
    ];

    const handoffs = await this.db.paymentHandoff.findMany({
      where: {
        organizationId,
        ...(siteId ? { siteId } : {}),
        ...(targetDeviceId
          ? {
              OR: [
                { targetDeviceId },
                { targetDeviceId: null, status: PaymentHandoffStatus.WAITING_FOR_DEVICE },
              ],
            }
          : {}),
        status: { in: activeStatuses },
      },
      include: {
        sourceDevice: true,
        targetDevice: true,
        sale: true,
        posPayment: {
          include: {
            stripePayment: true,
            attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const now = new Date();
    const result: IPaymentHandoffInfo[] = [];

    for (const h of handoffs) {
      if (
        h.expiresAt < now &&
        (h.status === PaymentHandoffStatus.CREATED ||
          h.status === PaymentHandoffStatus.WAITING_FOR_DEVICE ||
          h.status === PaymentHandoffStatus.ASSIGNED)
      ) {
        await this.db.paymentHandoff.updateMany({
          where: {
            id: h.id,
            status: {
              in: [
                PaymentHandoffStatus.CREATED,
                PaymentHandoffStatus.WAITING_FOR_DEVICE,
                PaymentHandoffStatus.ASSIGNED,
              ],
            },
          },
          data: { status: PaymentHandoffStatus.EXPIRED },
        });
        continue;
      }

      const latestAttempt = h.posPayment.attempts[0];
      const rawJson = latestAttempt?.rawResponseJson as any;

      result.push(
        this.mapToInfo(
          h,
          rawJson?.client_secret,
          h.posPayment.stripePayment?.stripePaymentIntentId || latestAttempt?.stripePaymentIntentId || null
        )
      );
    }

    return result;
  }

  /**
   * Target iPhone accepts the handoff with atomic database concurrency control (Compare-And-Swap)
   */
  async acceptHandoff(params: AcceptHandoffParams): Promise<{
    handoff: IPaymentHandoffInfo;
    clientSecret?: string;
    paymentIntentId?: string;
  }> {
    const { organizationId, userId, handoffId, targetDeviceId } = params;

    // Use Prisma transaction with atomic CAS update
    return await this.db.$transaction(async (tx) => {
      const handoff = await tx.paymentHandoff.findFirst({
        where: { id: handoffId, organizationId },
        include: {
          sourceDevice: true,
          targetDevice: true,
          sale: true,
          posPayment: {
            include: {
              stripePayment: true,
              attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
            },
          },
        },
      });

      if (!handoff) {
        throw new PaymentValidationError("Payment handoff not found.", "NOT_FOUND");
      }

      const now = new Date();
      if (handoff.expiresAt < now) {
        await tx.paymentHandoff.updateMany({
          where: {
            id: handoff.id,
            status: {
              in: [
                PaymentHandoffStatus.CREATED,
                PaymentHandoffStatus.WAITING_FOR_DEVICE,
                PaymentHandoffStatus.ASSIGNED,
              ],
            },
          },
          data: { status: PaymentHandoffStatus.EXPIRED },
        });
        throw new PaymentValidationError("This payment request has expired.", "HANDOFF_EXPIRED");
      }

      if (handoff.status === PaymentHandoffStatus.ACCEPTED && handoff.acceptedByUserId === userId) {
        // Idempotent re-acceptance by same user
        const latestAttempt = handoff.posPayment.attempts[0];
        const rawJson = latestAttempt?.rawResponseJson as any;
        return {
          handoff: this.mapToInfo(handoff, rawJson?.client_secret, latestAttempt?.stripePaymentIntentId),
          clientSecret: rawJson?.client_secret,
          paymentIntentId: latestAttempt?.stripePaymentIntentId || undefined,
        };
      }

      if (
        handoff.status !== PaymentHandoffStatus.ASSIGNED &&
        handoff.status !== PaymentHandoffStatus.WAITING_FOR_DEVICE
      ) {
        throw new PaymentValidationError(
          `Cannot accept payment handoff in state "${handoff.status}".`,
          "INVALID_STATE"
        );
      }

      // If handoff was explicitly assigned to a specific target device, enforce strictly
      if (handoff.targetDeviceId) {
        if (targetDeviceId && handoff.targetDeviceId !== targetDeviceId) {
          throw new PaymentValidationError(
            "This payment handoff is assigned to a different iPhone device.",
            "DEVICE_MISMATCH"
          );
        }
      }

      assertValidHandoffTransition(handoff.status, PaymentHandoffStatus.ACCEPTED);

      // ATOMIC COMPARE-AND-SWAP: Only 1 concurrent transaction can successfully transition
      const whereClause: any = {
        id: handoff.id,
        organizationId,
        status: { in: [PaymentHandoffStatus.ASSIGNED, PaymentHandoffStatus.WAITING_FOR_DEVICE] },
        expiresAt: { gt: now },
      };

      if (handoff.targetDeviceId) {
        whereClause.targetDeviceId = handoff.targetDeviceId;
      }

      const updateResult = await tx.paymentHandoff.updateMany({
        where: whereClause,
        data: {
          status: PaymentHandoffStatus.ACCEPTED,
          acceptedByUserId: userId,
          targetDeviceId: targetDeviceId || handoff.targetDeviceId,
          acceptedAt: now,
          version: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        // Lost race or state modified concurrently
        const current = await tx.paymentHandoff.findUnique({
          where: { id: handoff.id },
        });

        if (!current || current.expiresAt <= now || current.status === PaymentHandoffStatus.EXPIRED) {
          throw new PaymentValidationError("This payment request has expired.", "HANDOFF_EXPIRED");
        }
        if (current.status === PaymentHandoffStatus.ACCEPTED) {
          throw new PaymentValidationError(
            "Payment handoff has already been accepted by another device.",
            "CONFLICT"
          );
        }
        throw new PaymentValidationError(
          `Cannot accept payment handoff in state "${current.status}".`,
          "INVALID_STATE"
        );
      }

      const updated = await tx.paymentHandoff.findUnique({
        where: { id: handoff.id },
        include: {
          sourceDevice: true,
          targetDevice: true,
          sale: true,
          posPayment: {
            include: {
              stripePayment: true,
              attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
            },
          },
        },
      });

      if (!updated) {
        throw new PaymentValidationError("Payment handoff not found after update.", "NOT_FOUND");
      }

      const latestAttempt = updated.posPayment.attempts[0];
      const rawJson = latestAttempt?.rawResponseJson as any;

      return {
        handoff: this.mapToInfo(updated, rawJson?.client_secret, latestAttempt?.stripePaymentIntentId),
        clientSecret: rawJson?.client_secret,
        paymentIntentId: latestAttempt?.stripePaymentIntentId || undefined,
      };
    });
  }

  /**
   * Updates handoff state along the payment lifecycle with atomic state protection
   */
  async updateStatus(params: {
    organizationId: string;
    handoffId: string;
    status: PaymentHandoffStatus;
  }): Promise<IPaymentHandoffInfo> {
    const { organizationId, handoffId, status } = params;

    const handoff = await this.db.paymentHandoff.findFirst({
      where: { id: handoffId, organizationId },
    });

    if (!handoff) {
      throw new PaymentValidationError("Payment handoff not found.", "NOT_FOUND");
    }

    assertValidHandoffTransition(handoff.status, status);

    const data: any = { status, version: { increment: 1 } };
    if (status === PaymentHandoffStatus.SUCCEEDED) {
      data.completedAt = new Date();
    } else if (status === PaymentHandoffStatus.CANCELED || status === PaymentHandoffStatus.FAILED) {
      data.canceledAt = new Date();
    }

    const updateResult = await this.db.paymentHandoff.updateMany({
      where: { id: handoff.id, organizationId, status: handoff.status },
      data,
    });

    if (updateResult.count !== 1) {
      const current = await this.db.paymentHandoff.findUnique({ where: { id: handoff.id } });
      throw new PaymentValidationError(
        `Failed to transition handoff from state "${handoff.status}" to "${status}". Current state is "${current?.status}".`,
        "STATE_CONFLICT"
      );
    }

    const updated = await this.db.paymentHandoff.findUnique({
      where: { id: handoff.id },
      include: {
        sourceDevice: true,
        targetDevice: true,
        sale: true,
        posPayment: {
          include: {
            stripePayment: true,
            attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          },
        },
      },
    });

    return this.mapToInfo(updated);
  }

  /**
   * Rejects an assigned handoff from the target iPhone before financial collection begins
   */
  async rejectHandoff(params: RejectHandoffParams): Promise<IPaymentHandoffInfo> {
    const { organizationId, userId, handoffId, reason } = params;

    const handoff = await this.db.paymentHandoff.findFirst({
      where: { id: handoffId, organizationId },
    });

    if (!handoff) {
      throw new PaymentValidationError("Payment handoff not found.", "NOT_FOUND");
    }

    if (
      handoff.status === PaymentHandoffStatus.PAYMENT_PROCESSING ||
      handoff.status === PaymentHandoffStatus.VERIFYING ||
      handoff.status === PaymentHandoffStatus.SUCCEEDED ||
      handoff.status === PaymentHandoffStatus.UNKNOWN
    ) {
      throw new PaymentValidationError(
        "Cannot reject payment handoff once card presentation or processing has begun.",
        "PAYMENT_ALREADY_IN_FLIGHT"
      );
    }

    // Atomic rejection
    const updateResult = await this.db.paymentHandoff.updateMany({
      where: {
        id: handoff.id,
        organizationId,
        status: {
          in: [
            PaymentHandoffStatus.CREATED,
            PaymentHandoffStatus.WAITING_FOR_DEVICE,
            PaymentHandoffStatus.ASSIGNED,
            PaymentHandoffStatus.ACCEPTED,
          ],
        },
      },
      data: {
        status: PaymentHandoffStatus.CANCELED,
        canceledAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      const current = await this.db.paymentHandoff.findUnique({ where: { id: handoff.id } });
      if (
        current?.status === PaymentHandoffStatus.PAYMENT_PROCESSING ||
        current?.status === PaymentHandoffStatus.VERIFYING ||
        current?.status === PaymentHandoffStatus.SUCCEEDED
      ) {
        throw new PaymentValidationError(
          "Cannot reject payment handoff once card presentation or processing has begun.",
          "PAYMENT_ALREADY_IN_FLIGHT"
        );
      }
      throw new PaymentValidationError(
        `Cannot reject payment handoff in state "${current?.status}".`,
        "INVALID_STATE"
      );
    }

    const updated = await this.db.paymentHandoff.findUnique({
      where: { id: handoff.id },
      include: {
        sourceDevice: true,
        targetDevice: true,
        sale: true,
        posPayment: {
          include: {
            stripePayment: true,
          },
        },
      },
    });

    try {
      await logAudit({
        organizationId,
        actorUserId: userId,
        action: "REJECT_PAYMENT_HANDOFF",
        entity: "PaymentHandoff",
        entityId: handoff.id,
        meta: { reason: reason || "User rejected on iPhone" },
      });
    } catch {
      // Non-fatal audit log
    }

    return this.mapToInfo(updated);
  }

  /**
   * Cancels a pending handoff from the iPad POS before payment processing
   */
  async cancelHandoff(params: CancelHandoffParams): Promise<IPaymentHandoffInfo> {
    const { organizationId, userId, handoffId, reason } = params;

    const handoff = await this.db.paymentHandoff.findFirst({
      where: { id: handoffId, organizationId },
      include: {
        posPayment: {
          include: {
            stripePayment: true,
          },
        },
      },
    });

    if (!handoff) {
      throw new PaymentValidationError("Payment handoff not found.", "NOT_FOUND");
    }

    if (
      handoff.status === PaymentHandoffStatus.PAYMENT_PROCESSING ||
      handoff.status === PaymentHandoffStatus.VERIFYING ||
      handoff.status === PaymentHandoffStatus.SUCCEEDED ||
      handoff.status === PaymentHandoffStatus.UNKNOWN
    ) {
      throw new PaymentValidationError(
        "Cannot cancel payment handoff while payment processing is in progress.",
        "PAYMENT_IN_PROGRESS"
      );
    }

    // Atomic cancellation check & update
    const updateResult = await this.db.paymentHandoff.updateMany({
      where: {
        id: handoff.id,
        organizationId,
        status: {
          in: [
            PaymentHandoffStatus.CREATED,
            PaymentHandoffStatus.WAITING_FOR_DEVICE,
            PaymentHandoffStatus.ASSIGNED,
            PaymentHandoffStatus.ACCEPTED,
          ],
        },
      },
      data: {
        status: PaymentHandoffStatus.CANCELED,
        canceledAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      const current = await this.db.paymentHandoff.findUnique({ where: { id: handoff.id } });
      if (
        current?.status === PaymentHandoffStatus.PAYMENT_PROCESSING ||
        current?.status === PaymentHandoffStatus.VERIFYING ||
        current?.status === PaymentHandoffStatus.SUCCEEDED ||
        current?.status === PaymentHandoffStatus.UNKNOWN
      ) {
        throw new PaymentValidationError(
          "Cannot cancel payment handoff while payment processing is in progress.",
          "PAYMENT_IN_PROGRESS"
        );
      }
      throw new PaymentValidationError(
        `Cannot cancel payment handoff in state "${current?.status}".`,
        "INVALID_STATE"
      );
    }

    // Cancel backend PaymentIntent if exists
    if (handoff.posPayment?.stripePayment?.stripePaymentIntentId) {
      try {
        await this.orchestrator.cancelPaymentIntent({
          organizationId,
          posPaymentId: handoff.posPaymentId,
          reason: reason || "Canceled by POS operator",
        });
      } catch (err) {
        // Non-fatal if Stripe cancel fails
      }
    }

    const updated = await this.db.paymentHandoff.findUnique({
      where: { id: handoff.id },
      include: {
        sourceDevice: true,
        targetDevice: true,
        sale: true,
        posPayment: {
          include: {
            stripePayment: true,
          },
        },
      },
    });

    try {
      await logAudit({
        organizationId,
        actorUserId: userId,
        action: "CANCEL_PAYMENT_HANDOFF",
        entity: "PaymentHandoff",
        entityId: handoff.id,
        meta: { reason: reason || "Canceled from iPad" },
      });
    } catch {
      // Non-fatal audit log
    }

    return this.mapToInfo(updated);
  }

  /**
   * Retrieves available, authorized IPHONE_TAP_TO_PAY devices for a given site
   */
  async getAvailableTargetDevices(params: {
    organizationId: string;
    siteId?: string | null;
  }): Promise<IAvailableTargetDevice[]> {
    const { organizationId, siteId } = params;

    const devices = await this.db.pOSDevice.findMany({
      where: {
        organizationId,
        ...(siteId ? { siteId } : {}),
        deviceType: POSDeviceType.IPHONE_TAP_TO_PAY,
        status: { not: "INACTIVE" },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    // Check if any device has an active handoff in processing
    const activeHandoffs = await this.db.paymentHandoff.findMany({
      where: {
        organizationId,
        status: {
          in: [
            PaymentHandoffStatus.ACCEPTED,
            PaymentHandoffStatus.PAYMENT_PROCESSING,
            PaymentHandoffStatus.VERIFYING,
          ],
        },
        targetDeviceId: { not: null },
      },
      select: { targetDeviceId: true },
    });

    const busyDeviceIds = new Set(activeHandoffs.map((h) => h.targetDeviceId));

    return devices.map((d) => {
      const isBusy = busyDeviceIds.has(d.id);
      return {
        id: d.id,
        deviceUuid: d.deviceUuid,
        deviceName: d.deviceName,
        deviceType: "IPHONE_TAP_TO_PAY",
        status: isBusy ? "BUSY" : (d.status as any),
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : undefined,
        isAvailable: !isBusy && d.status === "ACTIVE",
      };
    });
  }

  private mapToInfo(
    handoff: any,
    clientSecret?: string | null,
    stripePaymentIntentId?: string | null
  ): IPaymentHandoffInfo {
    return {
      id: handoff.id,
      organizationId: handoff.organizationId,
      siteId: handoff.siteId,
      saleId: handoff.saleId,
      saleNumber: handoff.sale?.saleNumber || null,
      posPaymentId: handoff.posPaymentId,
      paymentAttemptId: handoff.paymentAttemptId,
      sourceDeviceId: handoff.sourceDeviceId,
      sourceDeviceName: handoff.sourceDevice?.deviceName || null,
      targetDeviceId: handoff.targetDeviceId,
      targetDeviceName: handoff.targetDevice?.deviceName || null,
      requestedByUserId: handoff.requestedByUserId,
      acceptedByUserId: handoff.acceptedByUserId,
      channel: handoff.channel,
      amount: Number(handoff.amount),
      currency: handoff.currency,
      status: handoff.status as any,
      expiresAt: handoff.expiresAt instanceof Date ? handoff.expiresAt.toISOString() : handoff.expiresAt,
      acceptedAt: handoff.acceptedAt ? handoff.acceptedAt.toISOString() : null,
      completedAt: handoff.completedAt ? handoff.completedAt.toISOString() : null,
      canceledAt: handoff.canceledAt ? handoff.canceledAt.toISOString() : null,
      clientSecret: clientSecret || null,
      stripePaymentIntentId: stripePaymentIntentId || handoff.posPayment?.stripePayment?.stripePaymentIntentId || null,
      createdAt: handoff.createdAt.toISOString(),
      updatedAt: handoff.updatedAt.toISOString(),
    };
  }
}

export const defaultPaymentHandoffService = new PaymentHandoffService();
