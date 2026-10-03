import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentOrchestrator } from "@/lib/payments/payment-orchestrator";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions." }, { status: 403 });
    }

    const body = await request.json();
    const { paymentIntentId, posPaymentId, reason } = body;

    if (!paymentIntentId && !posPaymentId) {
      return NextResponse.json(
        { error: "paymentIntentId or posPaymentId is required for cancellation." },
        { status: 400 }
      );
    }

    const result = await defaultPaymentOrchestrator.cancelPaymentIntent({
      organizationId,
      paymentIntentId: paymentIntentId ? String(paymentIntentId).trim() : undefined,
      posPaymentId: posPaymentId ? String(posPaymentId).trim() : undefined,
      reason: reason ? String(reason).trim() : undefined,
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

    console.error("[payments/stripe/cancel-intent] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error canceling payment intent" },
      { status: 500 }
    );
  }
}
