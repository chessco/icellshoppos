import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultStripeAdapter } from "@/lib/payments/stripe-adapter";
import { PaymentChannel, PosPaymentMethod, PosPaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { session, organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions." }, { status: 403 });
    }

    const body = await request.json();
    const {
      amount,
      currency = "mxn",
      saleId,
      customerEmail,
      customerName,
      description,
    } = body;

    if (amount === undefined || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "A valid positive numeric amount is required." },
        { status: 400 }
      );
    }

    const amountCents = Math.round(amount * 100);
    const normalizedCurrency = String(currency).toLowerCase();

    // Create a Checkout Session via Stripe
    const sessionResult = await defaultStripeAdapter.createCheckoutSession({
      amountCents,
      currency: normalizedCurrency,
      description: description || `Cobro en Tienda #${saleId || "POS"}`,
      organizationId,
      customerEmail: customerEmail ? String(customerEmail).trim() : undefined,
      metadata: {
        organizationId,
        saleId: saleId ? String(saleId) : "",
        userId: session.userId,
      },
    });

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      sessionResult.url || ""
    )}`;

    return NextResponse.json({
      ok: true,
      sessionId: sessionResult.id,
      checkoutUrl: sessionResult.url,
      qrCodeUrl,
      amount,
      currency: normalizedCurrency.toUpperCase(),
    });
  } catch (error) {
    console.error("[payments/stripe/create-checkout-session] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error creating Stripe checkout session" },
      { status: 500 }
    );
  }
}
