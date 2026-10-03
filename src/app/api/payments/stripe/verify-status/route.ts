import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentOrchestrator } from "@/lib/payments/payment-orchestrator";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;

    const body = await request.json();
    const { paymentIntentId, paymentAttemptId, posPaymentId } = body;

    if (!paymentIntentId && !paymentAttemptId && !posPaymentId) {
      return NextResponse.json(
        { error: "At least one identifier (paymentIntentId, paymentAttemptId, or posPaymentId) is required." },
        { status: 400 }
      );
    }

    const result = await defaultPaymentOrchestrator.verifyPaymentStatus({
      organizationId,
      paymentIntentId: paymentIntentId ? String(paymentIntentId).trim() : undefined,
      paymentAttemptId: paymentAttemptId ? String(paymentAttemptId).trim() : undefined,
      posPaymentId: posPaymentId ? String(posPaymentId).trim() : undefined,
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

    console.error("[payments/stripe/verify-status] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error verifying payment status" },
      { status: 500 }
    );
  }
}
