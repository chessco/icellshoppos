import test from "node:test";
import assert from "node:assert/strict";
import { PaymentOrchestrator } from "../src/lib/payments/payment-orchestrator";
import { IStripePaymentAdapter } from "../src/lib/payments/stripe-adapter";
import { PaymentChannel, PosPaymentStatus, PaymentAttemptStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import Stripe from "stripe";

/**
 * Mock Stripe Terminal Adapter mimicking Stripe Reader M2 hardware behavior
 */
class SimulatedIpadTerminalStripeAdapter implements IStripePaymentAdapter {
  public intents = new Map<string, any>();
  public sessions = new Map<string, any>();

  async createConnectionToken(locationId?: string, organizationId?: string): Promise<{ secret: string }> {
    return { secret: `pst_test_ipad_${organizationId || "org"}_${Date.now()}` };
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: any;
    idempotencyKey: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    const id = `pi_sim_ipad_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const intent: any = {
      id,
      amount: params.amountCents,
      currency: params.currency,
      status: "requires_payment_method",
      client_secret: `${id}_secret_${Date.now()}`,
      metadata: params.metadata,
      payment_method_types: ["card_present"],
      latest_charge: null,
    };
    this.intents.set(id, intent);
    return intent;
  }

  async retrievePaymentIntent(paymentIntentId: string, organizationId?: string): Promise<Stripe.PaymentIntent> {
    const found = this.intents.get(paymentIntentId);
    if (!found) {
      return {
        id: paymentIntentId,
        amount: 15000,
        currency: "mxn",
        status: "succeeded",
        metadata: {},
        latest_charge: {
          id: `ch_sim_${paymentIntentId}`,
          status: "succeeded",
          payment_method_details: {
            card_present: {
              brand: "visa",
              last4: "4242",
              read_method: "contactless",
            },
          },
        },
      } as any;
    }
    return found;
  }

  async cancelPaymentIntent(paymentIntentId: string, reason?: string, organizationId?: string): Promise<Stripe.PaymentIntent> {
    const found = this.intents.get(paymentIntentId) || { id: paymentIntentId };
    found.status = "canceled";
    this.intents.set(paymentIntentId, found);
    return found as any;
  }

  constructWebhookEvent(rawBody: string | Buffer, signature: string, secret?: string): Stripe.Event {
    return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  }

  async createCheckoutSession(params: {
    amountCents: number;
    currency: string;
    description: string;
    organizationId: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    const id = `cs_test_ipad_${Date.now()}`;
    const session: any = {
      id,
      url: `https://checkout.stripe.com/pay/${id}`,
      amount_total: params.amountCents,
      currency: params.currency,
      metadata: params.metadata,
    };
    this.sessions.set(id, session);
    return session;
  }

  // Helper method to simulate customer tapping/inserting card on Reader M2
  simulateCardPresentTap(paymentIntentId: string) {
    const intent = this.intents.get(paymentIntentId);
    if (intent) {
      intent.status = "succeeded";
      intent.latest_charge = {
        id: `ch_sim_success_${paymentIntentId}`,
        status: "succeeded",
        amount: intent.amount,
        currency: intent.currency,
        receipt_url: `https://stripe.com/receipts/sim_${paymentIntentId}`,
        payment_method_details: {
          card_present: {
            brand: "visa",
            last4: "4242",
            read_method: "contactless_emv",
            receipt: {
              application_preferred_name: "VISA DEBIT",
              dedicated_file_name: "A0000000031010",
              authorization_code: "123456",
            },
          },
        },
      };
      this.intents.set(paymentIntentId, intent);
    }
  }
}

test("iPad POS Terminal Reader - Complete Automated Simulation Suite", async (t) => {
  const mockAdapter = new SimulatedIpadTerminalStripeAdapter();
  const orchestrator = new PaymentOrchestrator(db, mockAdapter);

  // Setup isolated test organization and user in DB
  const testOrg = await db.organization.create({
    data: {
      id: `org_ipad_sim_${Date.now()}`,
      name: "iPad POS Simulation Store",
      slug: `slug_ipad_${Date.now()}`,
      status: "active",
    },
  });

  const testUser = await db.user.create({
    data: {
      email: `cashier_ipad_${Date.now()}@pitayacode.io`,
      passwordHash: "hash",
      fullName: "iPad Cashier 1",
    },
  });

  t.after(async () => {
    // Cleanup test data
    try {
      await db.stripePaymentRecord.deleteMany({ where: { organizationId: testOrg.id } });
      await db.paymentAttempt.deleteMany({ where: { payment: { organizationId: testOrg.id } } });
      await db.posPayment.deleteMany({ where: { organizationId: testOrg.id } });
      await db.stripeReader.deleteMany({ where: { organizationId: testOrg.id } });
      await db.pOSDevice.deleteMany({ where: { organizationId: testOrg.id } });
      await db.user.deleteMany({ where: { id: testUser.id } });
      await db.organization.deleteMany({ where: { id: testOrg.id } });
    } catch {
      // Ignored
    }
  });

  await t.test("1. iPad SDK Connection Token Request", async () => {
    const tokenRes = await orchestrator.createConnectionToken({
      organizationId: testOrg.id,
      userId: testUser.id,
    });

    assert.ok(tokenRes.secret, "Connection token secret must be returned");
    assert.match(tokenRes.secret, /^pst_test_ipad_/, "Must be formatted as a valid Stripe connection token");
  });

  await t.test("2. iPad Initiates Pre-sale Payment Intent with Stripe Reader M2 (Serial STRM26146031090)", async () => {
    const idempotencyKey = `ik_ipad_${Date.now()}_01`;
    const chargeAmount = 289.50;

    const intentResult = await orchestrator.createPaymentIntent({
      organizationId: testOrg.id,
      userId: testUser.id,
      saleId: `sale_ipad_mock_${Date.now()}`,
      amount: chargeAmount,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      stripeReaderId: "STRM26146031090", // Raw hardware serial
      idempotencyKey,
      notes: "Cobro con lector M2 en iPad",
    });

    assert.strictEqual(intentResult.success, true);
    assert.strictEqual(intentResult.amount, chargeAmount);
    assert.strictEqual(intentResult.currency, "MXN");
    assert.strictEqual(intentResult.channel, PaymentChannel.STRIPE_READER);
    assert.ok(intentResult.stripePaymentIntentId.startsWith("pi_sim_ipad_"), "Stripe PaymentIntent must be created");

    // Verify DB state
    const posPayment = await db.posPayment.findUnique({
      where: { id: intentResult.posPaymentId },
      include: { stripePayment: true, attempts: true },
    });

    assert.ok(posPayment, "PosPayment must be recorded in database");
    assert.strictEqual(posPayment.status, PosPaymentStatus.PROCESSING);
    assert.strictEqual(posPayment.stripePayment?.stripePaymentIntentId, intentResult.stripePaymentIntentId);
    assert.strictEqual(posPayment.attempts.length, 1);
  });

  await t.test("3. Idempotent Replay on iPad (Network Retry / Double Tap)", async () => {
    const idempotencyKey = `ik_ipad_idempotency_${Date.now()}`;

    // First attempt
    const firstCall = await orchestrator.createPaymentIntent({
      organizationId: testOrg.id,
      userId: testUser.id,
      amount: 199.00,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      stripeReaderId: "STRM26146031090",
      idempotencyKey,
    });

    // Simulated network retry from iPad
    const replayCall = await orchestrator.createPaymentIntent({
      organizationId: testOrg.id,
      userId: testUser.id,
      amount: 199.00,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      stripeReaderId: "STRM26146031090",
      idempotencyKey,
    });

    assert.strictEqual(replayCall.posPaymentId, firstCall.posPaymentId, "Must return identical posPaymentId");
    assert.strictEqual(replayCall.stripePaymentIntentId, firstCall.stripePaymentIntentId, "Must return identical intent ID");
    assert.strictEqual(replayCall.idempotentReplay, true, "Must flag idempotentReplay as true");
  });

  await t.test("4. Simulated Physical Card Tap & Authoritative Status Verification", async () => {
    const idempotencyKey = `ik_ipad_tap_${Date.now()}`;

    // 1. Create intent
    const intentResult = await orchestrator.createPaymentIntent({
      organizationId: testOrg.id,
      userId: testUser.id,
      amount: 450.00,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      stripeReaderId: "STRM26146031090",
      idempotencyKey,
    });

    // 2. Simulate customer presenting Visa card to Stripe Reader M2
    mockAdapter.simulateCardPresentTap(intentResult.stripePaymentIntentId);

    // 3. Authoritative backend verification (called by iPad POS after terminal SDK collect & process)
    const verification = await orchestrator.verifyPaymentStatus({
      organizationId: testOrg.id,
      paymentIntentId: intentResult.stripePaymentIntentId,
    });

    assert.strictEqual(verification.success, true);
    assert.strictEqual(verification.status, PosPaymentStatus.SUCCEEDED);
    assert.strictEqual(verification.cardBrand, "visa");
    assert.strictEqual(verification.cardLast4, "4242");

    // 4. Verify DB was updated to SUCCEEDED
    const updatedPayment = await db.posPayment.findUnique({
      where: { id: intentResult.posPaymentId },
    });
    assert.strictEqual(updatedPayment?.status, PosPaymentStatus.SUCCEEDED);
  });

  await t.test("5. Direct Stripe Online Payment (QR Code & Checkout Session without Terminal)", async () => {
    const session = await mockAdapter.createCheckoutSession({
      amountCents: 35000,
      currency: "mxn",
      description: "Cobro POS sin terminal",
      organizationId: testOrg.id,
      customerEmail: "cliente@ejemplo.com",
    });

    assert.ok(session.id, "Stripe Checkout session ID must be generated");
    assert.ok(session.url.includes("checkout.stripe.com"), "Must provide hosted checkout URL");
    assert.strictEqual(session.amount_total, 35000);
  });

  await t.test("6. Payment Cancellation on iPad (Customer Aborts Checkout)", async () => {
    const idempotencyKey = `ik_ipad_cancel_${Date.now()}`;

    const intentResult = await orchestrator.createPaymentIntent({
      organizationId: testOrg.id,
      userId: testUser.id,
      amount: 100.00,
      currency: "mxn",
      channel: PaymentChannel.STRIPE_READER,
      stripeReaderId: "STRM26146031090",
      idempotencyKey,
    });

    const cancelResult = await orchestrator.cancelPaymentIntent({
      organizationId: testOrg.id,
      paymentIntentId: intentResult.stripePaymentIntentId,
      reason: "customer_canceled",
    });

    assert.strictEqual(cancelResult.success, true);
    assert.strictEqual(cancelResult.status, "canceled");

    const canceledPayment = await db.posPayment.findUnique({
      where: { id: intentResult.posPaymentId },
    });
    assert.strictEqual(canceledPayment?.status, PosPaymentStatus.CANCELED);
  });
});
