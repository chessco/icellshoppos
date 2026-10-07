import test from "node:test";
import assert from "node:assert/strict";
import { PaymentOrchestrator } from "../src/lib/payments/payment-orchestrator";
import { IStripePaymentAdapter } from "../src/lib/payments/stripe-adapter";
import { PaymentChannel, PosPaymentStatus, PaymentAttemptStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import Stripe from "stripe";

// Mock Stripe Adapter implementation for deterministic unit testing
class MockStripePaymentAdapter implements IStripePaymentAdapter {
  public intents = new Map<string, any>();
  public lastCreatedIntent: any = null;

  async createConnectionToken(locationId?: string): Promise<{ secret: string }> {
    return { secret: `pst_test_secret_${Date.now()}` };
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: any;
    idempotencyKey: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    const id = `pi_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const intent: any = {
      id,
      amount: params.amountCents,
      currency: params.currency,
      status: "requires_payment_method",
      client_secret: `${id}_secret_${Date.now()}`,
      metadata: params.metadata,
      latest_charge: {
        id: `ch_test_${Date.now()}`,
        status: "succeeded",
        receipt_url: "https://stripe.com/receipt/test",
        payment_method_details: {
          card_present: {
            brand: "visa",
            last4: "4242",
            read_method: "contactless",
          },
        },
      },
    };
    this.intents.set(id, intent);
    this.lastCreatedIntent = intent;
    return intent;
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    const found = this.intents.get(paymentIntentId);
    if (!found) {
      // Return default succeeded test intent
      return {
        id: paymentIntentId,
        amount: 150000,
        currency: "mxn",
        status: "succeeded",
        metadata: {},
        latest_charge: {
          id: `ch_test_${paymentIntentId}`,
          status: "succeeded",
          receipt_url: "https://stripe.com/receipt/test",
          payment_method_details: {
            card_present: {
              brand: "mastercard",
              last4: "8888",
              read_method: "chip",
            },
          },
        },
      } as any;
    }
    return found;
  }

  async cancelPaymentIntent(paymentIntentId: string, reason?: string): Promise<Stripe.PaymentIntent> {
    const found = this.intents.get(paymentIntentId) || { id: paymentIntentId };
    found.status = "canceled";
    this.intents.set(paymentIntentId, found);
    return found as any;
  }

  constructWebhookEvent(rawBody: string | Buffer, signature: string, secret?: string): Stripe.Event {
    if (signature === "invalid_sig") {
      throw new Error("Invalid signature");
    }
    const parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : JSON.parse(rawBody.toString());
    return parsed as Stripe.Event;
  }

  async createCheckoutSession(params: any): Promise<any> {
    return {
      id: `cs_test_${Date.now()}`,
      url: `https://checkout.stripe.com/pay/cs_test_${Date.now()}`,
    };
  }
}

test("Payment Orchestrator: Integration with Mocked Stripe Adapter", async (t) => {
  const mockAdapter = new MockStripePaymentAdapter();
  const orchestrator = new PaymentOrchestrator(db, mockAdapter);

  // Setup test organizations and user in DB
  const testOrgA = `test_org_a_${Date.now()}`;
  const testOrgB = `test_org_b_${Date.now()}`;

  const orgA = await db.organization.create({
    data: {
      id: testOrgA,
      name: "Test Org A",
      slug: `test-org-a-${Date.now()}`,
    },
  });

  const orgB = await db.organization.create({
    data: {
      id: testOrgB,
      name: "Test Org B",
      slug: `test-org-b-${Date.now()}`,
    },
  });

  const testUser = await db.user.create({
    data: {
      email: `test_seller_${Date.now()}@example.com`,
      passwordHash: "hash",
      fullName: "Test Seller",
    },
  });

  // 1. Connection Token Creation
  await t.test("Connection Token: Generates secure token for authorized org", async () => {
    const tokenResult = await orchestrator.createConnectionToken({
      organizationId: orgA.id,
      userId: testUser.id,
    });
    assert.ok(tokenResult.secret.startsWith("pst_test_secret_"));
  });

  // 2. Create PaymentIntent for STRIPE_READER
  let createdPaymentA: any;
  await t.test("Create PaymentIntent (STRIPE_READER): Authoritatively creates intent & DB records", async () => {
    const idempotencyKey = `idem_reader_${Date.now()}`;
    const result = await orchestrator.createPaymentIntent({
      organizationId: orgA.id,
      userId: testUser.id,
      amount: 1500.5,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      idempotencyKey,
      notes: "iPad BLE Reader Test",
    });

    assert.equal(result.success, true);
    assert.equal(result.amount, 1500.5);
    assert.equal(result.currency, "MXN");
    assert.equal(result.channel, PaymentChannel.STRIPE_READER);
    assert.equal(result.status, PosPaymentStatus.PROCESSING);
    assert.equal(result.idempotentReplay, false);
    assert.ok(result.stripePaymentIntentId.startsWith("pi_test_"));
    assert.ok(result.clientSecret.length > 0);

    createdPaymentA = result;

    // Verify DB records exist
    const posPayment = await db.posPayment.findUnique({
      where: { id: result.posPaymentId },
      include: { attempts: true, stripePayment: true },
    });
    assert.ok(posPayment);
    assert.equal(posPayment?.organizationId, orgA.id);
    assert.equal(posPayment?.paymentChannel, PaymentChannel.STRIPE_READER);
    assert.equal(posPayment?.attempts.length, 1);
    assert.equal(posPayment?.stripePayment?.stripePaymentIntentId, result.stripePaymentIntentId);
  });

  // 3. Create PaymentIntent for STRIPE_TAP_TO_PAY_IPHONE
  await t.test("Create PaymentIntent (STRIPE_TAP_TO_PAY_IPHONE): Works for Tap to Pay channel", async () => {
    const idempotencyKey = `idem_tap_${Date.now()}`;
    const result = await orchestrator.createPaymentIntent({
      organizationId: orgA.id,
      userId: testUser.id,
      amount: 850.0,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE,
      idempotencyKey,
      notes: "iPhone Tap to Pay Test",
    });

    assert.equal(result.success, true);
    assert.equal(result.channel, PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE);
    assert.equal(result.amount, 850.0);
  });

  // 4. Idempotent Replay
  await t.test("Idempotency: Replays existing payment without creating duplicates", async () => {
    const duplicateKey = `idem_dup_${Date.now()}`;
    const first = await orchestrator.createPaymentIntent({
      organizationId: orgA.id,
      userId: testUser.id,
      amount: 500.0,
      channel: PaymentChannel.STRIPE_READER,
      idempotencyKey: duplicateKey,
    });

    assert.equal(first.idempotentReplay, false);

    const second = await orchestrator.createPaymentIntent({
      organizationId: orgA.id,
      userId: testUser.id,
      amount: 500.0,
      channel: PaymentChannel.STRIPE_READER,
      idempotencyKey: duplicateKey,
    });

    assert.equal(second.idempotentReplay, true);
    assert.equal(second.posPaymentId, first.posPaymentId);
    assert.equal(second.stripePaymentIntentId, first.stripePaymentIntentId);

    // Verify DB only has 1 record for this key
    const count = await db.posPayment.count({
      where: { organizationId: orgA.id, idempotencyKey: duplicateKey },
    });
    assert.equal(count, 1);
  });

  // 5. Multi-Tenant Isolation
  await t.test("Multi-Tenancy: Org B cannot access or verify Org A payments", async () => {
    await assert.rejects(
      () =>
        orchestrator.verifyPaymentStatus({
          organizationId: orgB.id,
          posPaymentId: createdPaymentA.posPaymentId,
        }),
      /Payment record not found/
    );
  });

  // 6. Verify Payment Status & Orphan Detection
  await t.test("Verify Status: Queries Stripe directly and flags orphan payment", async () => {
    // Simulate reader card swipe processing succeeding on Stripe Cloud
    const intentOnStripe = mockAdapter.intents.get(createdPaymentA.stripePaymentIntentId);
    if (intentOnStripe) {
      intentOnStripe.status = "succeeded";
      intentOnStripe.latest_charge = {
        id: `ch_test_${Date.now()}`,
        status: "succeeded",
        payment_method_details: {
          card_present: {
            brand: "mastercard",
            last4: "8888",
            read_method: "chip",
          },
        },
      };
    }

    const verified = await orchestrator.verifyPaymentStatus({
      organizationId: orgA.id,
      posPaymentId: createdPaymentA.posPaymentId,
    });

    assert.equal(verified.success, true);
    assert.equal(verified.status, PosPaymentStatus.SUCCEEDED);
    assert.equal(verified.attemptStatus, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(verified.cardBrand, "mastercard");
    assert.equal(verified.cardLast4, "8888");
    assert.equal(verified.cardEntryMethod, "chip");
    assert.equal(verified.isOrphan, true); // No sale attached yet!

    // Check orphan recovery getter
    const orphans = await orchestrator.getOrphanPayments(orgA.id);
    assert.ok(orphans.some((o) => o.id === createdPaymentA.posPaymentId));
  });

  // 7. Cancel Payment Intent
  await t.test("Cancel Intent: Cancels intent on Stripe and marks DB as CANCELED", async () => {
    const toCancelKey = `idem_cancel_${Date.now()}`;
    const p = await orchestrator.createPaymentIntent({
      organizationId: orgA.id,
      userId: testUser.id,
      amount: 300,
      channel: PaymentChannel.STRIPE_READER,
      idempotencyKey: toCancelKey,
    });

    const canceled = await orchestrator.cancelPaymentIntent({
      organizationId: orgA.id,
      posPaymentId: p.posPaymentId,
    });
    assert.equal(canceled.success, true);
    assert.equal(canceled.status, "canceled");

    const updated = await db.posPayment.findUnique({ where: { id: p.posPaymentId } });
    assert.equal(updated?.status, PosPaymentStatus.CANCELED);
  });

  // 8. Webhook Processing & Idempotency
  await t.test("Webhook Processing: Ingests events and prevents duplicate processing", async () => {
    const webhookEventId = `evt_test_${Date.now()}`;
    const webhookPayload = {
      id: webhookEventId,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: createdPaymentA.stripePaymentIntentId,
          status: "succeeded",
        },
      },
    };

    // First processing
    const firstRes = await orchestrator.processWebhookEvent({
      rawBody: JSON.stringify(webhookPayload),
      signature: "valid_sig",
    });
    assert.equal(firstRes.received, true);
    assert.equal(firstRes.processed, true);

    // Duplicate webhook with same eventId
    const dupRes = await orchestrator.processWebhookEvent({
      rawBody: JSON.stringify(webhookPayload),
      signature: "valid_sig",
    });
    assert.equal(dupRes.received, true);
    assert.equal(dupRes.processed, true);

    const eventRecords = await db.stripeWebhookEvent.count({
      where: { stripeEventId: webhookEventId },
    });
    assert.equal(eventRecords, 1);
  });

  // Cleanup test entities
  await db.posPayment.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await db.stripeWebhookEvent.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await db.user.delete({ where: { id: testUser.id } });
  await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
});
