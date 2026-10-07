import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentOrchestrator } from "@/lib/payments/payment-orchestrator";
import { PaymentChannel } from "@prisma/client";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { session, organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions to create payments." }, { status: 403 });
    }

    const body = await request.json();
    const {
      saleId,
      amount,
      currency = "mxn",
      channel = PaymentChannel.STRIPE_READER,
      posDeviceId,
      stripeReaderId,
      idempotencyKey,
      notes,
      cartContext,
    } = body;

    const finalIdempotencyKey =
      typeof idempotencyKey === "string" && idempotencyKey.trim()
        ? idempotencyKey.trim()
        : saleId
        ? `pos_intent_${String(saleId).trim()}`
        : `pos_intent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (amount === undefined || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "A valid positive numeric amount is required." },
        { status: 400 }
      );
    }

    // Validate channel enum
    const validChannel =
      channel === PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE
        ? PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE
        : PaymentChannel.STRIPE_READER;

    const result = await defaultPaymentOrchestrator.createPaymentIntent({
      organizationId,
      userId: session.userId,
      saleId: saleId ? String(saleId).trim() : undefined,
      amount,
      currency: String(currency).toLowerCase(),
      channel: validChannel,
      posDeviceId: posDeviceId ? String(posDeviceId).trim() : undefined,
      stripeReaderId: stripeReaderId ? String(stripeReaderId).trim() : undefined,
      idempotencyKey: finalIdempotencyKey,
      notes: notes ? String(notes).trim() : undefined,
      cartContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }

    console.error("[payments/stripe/create-intent] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error creating payment intent" },
      { status: 500 }
    );
  }
}
