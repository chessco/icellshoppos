import { NextRequest, NextResponse } from "next/server";
import { defaultPaymentOrchestrator } from "@/lib/payments/payment-orchestrator";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  try {
    const rawBody = await request.text();
    const result = await defaultPaymentOrchestrator.processWebhookEvent({
      rawBody,
      signature,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[payments/stripe/webhook] error processing event:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handler error" },
      { status: 400 }
    );
  }
}
