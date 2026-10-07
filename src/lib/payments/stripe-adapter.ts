/**
 * Pro Buyer POS Payment System - Stripe Adapter
 *
 * Encapsulates all server-side Stripe Terminal and PaymentIntent API interactions.
 * Guarantees that STRIPE_SECRET_KEY remains strictly server-side.
 *
 * Supports:
 * - Connection Token creation (for React Native Terminal SDK on iPad / iPhone)
 * - Card-present PaymentIntent creation with full metadata tagging
 * - Authoritative PaymentIntent status verification
 * - PaymentIntent cancellation
 * - Webhook event signature verification
 */

import Stripe from "stripe";
import { stripe as defaultStripeClient, getStripeForOrg } from "@/lib/stripe";
import { StripeMetadataPayload } from "./types";

export interface IStripePaymentAdapter {
  createConnectionToken(locationId?: string, organizationId?: string): Promise<{ secret: string }>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: StripeMetadataPayload;
    idempotencyKey: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent>;
  retrievePaymentIntent(paymentIntentId: string, organizationId?: string): Promise<Stripe.PaymentIntent>;
  cancelPaymentIntent(
    paymentIntentId: string,
    reason?: string,
    organizationId?: string
  ): Promise<Stripe.PaymentIntent>;
  constructWebhookEvent(
    rawBody: string | Buffer,
    signature: string,
    secret?: string
  ): Stripe.Event;
  createCheckoutSession(params: {
    amountCents: number;
    currency: string;
    description: string;
    organizationId: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session>;
}

export class StripePaymentAdapter implements IStripePaymentAdapter {
  constructor(private readonly fallbackStripe: Stripe = defaultStripeClient) {}

  private async getClient(organizationId?: string): Promise<Stripe> {
    if (organizationId) {
      return await getStripeForOrg(organizationId);
    }
    return this.fallbackStripe;
  }

  /**
   * Generates a short-lived Connection Token for the mobile Stripe Terminal SDK
   */
  async createConnectionToken(locationId?: string, organizationId?: string): Promise<{ secret: string }> {
    const client = await this.getClient(organizationId);
    const params: Stripe.Terminal.ConnectionTokenCreateParams = {};
    if (locationId) {
      params.location = locationId;
    }
    const token = await client.terminal.connectionTokens.create(params);
    return { secret: token.secret };
  }

  /**
   * Creates a card-present PaymentIntent on Stripe with audit metadata and idempotency key
   */
  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: StripeMetadataPayload;
    idempotencyKey: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    const { amountCents, currency, metadata, idempotencyKey, description } = params;
    const client = await this.getClient(metadata.organizationId);

    const metadataRecord: Record<string, string> = {
      organizationId: metadata.organizationId,
      posPaymentId: metadata.posPaymentId,
      paymentAttemptId: metadata.paymentAttemptId,
      paymentChannel: metadata.paymentChannel,
    };

    if (metadata.saleId) {
      metadataRecord.saleId = metadata.saleId;
    }
    if (metadata.posDeviceId) {
      metadataRecord.posDeviceId = metadata.posDeviceId;
    }
    if (metadata.environment) {
      metadataRecord.environment = metadata.environment;
    }

    return await client.paymentIntents.create(
      {
        amount: amountCents,
        currency: currency.toLowerCase(),
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        description: description || `POS Charge ${metadata.posPaymentId}`,
        metadata: metadataRecord,
      },
      {
        idempotencyKey,
      }
    );
  }

  /**
   * Retrieves the authoritative PaymentIntent status from Stripe
   */
  async retrievePaymentIntent(paymentIntentId: string, organizationId?: string): Promise<Stripe.PaymentIntent> {
    const client = await this.getClient(organizationId);
    return await client.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge", "payment_method"],
    });
  }

  /**
   * Cancels a pending PaymentIntent on Stripe
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    cancellationReason?: string,
    organizationId?: string
  ): Promise<Stripe.PaymentIntent> {
    const client = await this.getClient(organizationId);
    const options: Stripe.PaymentIntentCancelParams = {};
    if (
      cancellationReason === "duplicate" ||
      cancellationReason === "fraudulent" ||
      cancellationReason === "requested_by_customer" ||
      cancellationReason === "abandoned"
    ) {
      options.cancellation_reason = cancellationReason;
    }

    return await client.paymentIntents.cancel(paymentIntentId, options);
  }

  /**
   * Validates Stripe webhook signature and reconstructs event
   */
  constructWebhookEvent(
    rawBody: string | Buffer,
    signature: string,
    secret?: string
  ): Stripe.Event {
    const webhookSecret =
      secret ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      "whsec_dummy_for_testing";

    return this.fallbackStripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async createCheckoutSession(params: {
    amountCents: number;
    currency: string;
    description: string;
    organizationId: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    const client = await this.getClient(params.organizationId);
    const origin = process.env.NEXTAUTH_URL || "https://probuyer.pitayacode.io";

    return await client.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: params.description || "Cobro POS ProBuyer",
            },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: params.customerEmail || undefined,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment-cancel`,
      metadata: params.metadata,
    });
  }
}

export const defaultStripeAdapter = new StripePaymentAdapter();
