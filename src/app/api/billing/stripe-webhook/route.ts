import { NextRequest, NextResponse } from "next/server";
import { constructStripeWebhookEvent, handleStripeWebhookEvent } from "@/lib/stripe-webhook";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event;
  try {
    event = constructStripeWebhookEvent(body, sig);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
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
      return NextResponse.json({ received: true, ignored: true });
    }

    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
