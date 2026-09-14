import { NextRequest, NextResponse } from "next/server";
import { constructStripeWebhookEvent, handleStripeWebhookEvent } from "@/lib/stripe-webhook";

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const buf = await request.arrayBuffer();
  let event;
  try {
    event = constructStripeWebhookEvent(Buffer.from(buf), sig!);
  } catch (err) {
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  try {
    await handleStripeWebhookEvent(event);
  } catch (error) {
    console.error("[stripe webhook] handler failed", {
      eventId: event?.id,
      eventType: event?.type,
      error: error instanceof Error ? error.message : String(error),
    });

    if (typeof event?.type === "string" && event.type.startsWith("payment_intent.")) {
      return NextResponse.json({ status: "ignored" });
    }

    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
