import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

const STRIPE_STATUS_MAP: Record<string, "trialing" | "active" | "past_due" | "canceled" | "unpaid"> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
};

const toDate = (ts: number | null | undefined) =>
  ts ? new Date(ts * 1000) : null;

const getMetadataValue = (
  metadata: Stripe.Metadata | null | undefined,
  key: "organizationId" | "userId"
) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const getInvoiceSubscriptionId = (invoice: Stripe.Invoice) => {
  if (invoice.parent?.type !== "subscription_details") {
    return null;
  }

  const subscription = invoice.parent.subscription_details?.subscription;
  if (typeof subscription === "string") {
    return subscription;
  }

  return subscription?.id ?? null;
};

const getSubscriptionContext = async (stripeSubscriptionId: string | null) => {
  if (!stripeSubscriptionId) {
    return null;
  }

  return db.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: {
      id: true,
      organizationId: true,
    },
  });
};

const getInvoiceContext = async (invoice: Stripe.Invoice) => {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const metadataOrgId = getMetadataValue(invoice.metadata, "organizationId")
    ?? getMetadataValue(invoice.parent?.subscription_details?.metadata, "organizationId");
  const metadataUserId = getMetadataValue(invoice.metadata, "userId")
    ?? getMetadataValue(invoice.parent?.subscription_details?.metadata, "userId");

  // Look up by subscription first, then fall back to customer ID
  let subscription = await getSubscriptionContext(stripeSubscriptionId);
  if (!subscription && stripeCustomerId) {
    subscription = await db.subscription.findFirst({
      where: { stripeCustomerId },
      select: { id: true, organizationId: true },
    });
  }

  const organizationId = metadataOrgId ?? subscription?.organizationId ?? null;
  const fallbackMembership = organizationId
    ? await db.membership.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      })
    : null;

  return {
    organizationId,
    userId: metadataUserId ?? fallbackMembership?.userId ?? null,
    stripeSubscriptionId,
  };
};

const summarizeMeta = (meta: Record<string, unknown>) =>
  JSON.stringify(meta, null, 2).slice(0, 2000);

async function logWebhookEvent({
  action,
  organizationId,
  entityId,
  meta,
}: {
  action: string;
  organizationId?: string | null;
  entityId?: string | null;
  meta: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      organizationId: organizationId ?? undefined,
      action,
      entity: "stripe_webhook",
      entityId: entityId ?? undefined,
      meta: {
        ...meta,
        details: summarizeMeta(meta),
      },
    },
  }).catch(() => null);
}

export function constructStripeWebhookEvent(rawBody: string | Buffer, signature: string) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = getMetadataValue(session.metadata, "organizationId");
      const userId = getMetadataValue(session.metadata, "userId");
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      if (orgId && stripeCustomerId && stripeSubscriptionId) {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const stripePriceId = stripeSub.items.data[0]?.price?.id ?? null;
        const plan = stripePriceId
          ? await db.plan.findFirst({ where: { stripePriceId } })
          : null;

        await db.subscription.updateMany({
          where: { organizationId: orgId },
          data: {
            stripeCustomerId,
            stripeSubscriptionId,
            status: STRIPE_STATUS_MAP[stripeSub.status] ?? "active",
            ...(plan ? { planId: plan.id } : {}),
            currentPeriodStart: toDate(stripeSub.items.data[0]?.current_period_start),
            currentPeriodEnd: toDate(stripeSub.items.data[0]?.current_period_end),
            trialEndsAt: toDate(stripeSub.trial_end),
          },
        });

        // Write payment record for the initial checkout payment (dedup by session ID)
        if (userId && (session.amount_total ?? 0) > 0) {
          const existing = await db.payment.findFirst({ where: { stripeSessionId: session.id } });
          if (!existing) {
            await db.payment.create({
              data: {
                organizationId: orgId,
                userId,
                stripePaymentId: null,
                stripeSessionId: session.id,
                amountCents: session.amount_total ?? 0,
                currency: session.currency ?? "usd",
                status: "succeeded",
              },
            }).catch(() => null);
          }
        }
      }

      await logWebhookEvent({
        action: "billing.webhook.checkout_completed",
        organizationId: orgId,
        entityId: session.id,
        meta: {
          eventType: event.type,
          organizationId: orgId,
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          amountTotal: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
        },
      });
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const stripePriceId = sub.items.data[0]?.price?.id ?? null;
      const plan = stripePriceId
        ? await db.plan.findFirst({ where: { stripePriceId } })
        : null;
      const subscription = await getSubscriptionContext(sub.id);

      await db.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: {
          status: STRIPE_STATUS_MAP[sub.status] ?? "active",
          ...(plan ? { planId: plan.id } : {}),
          currentPeriodStart: toDate(sub.items.data[0]?.current_period_start),
          currentPeriodEnd: toDate(sub.items.data[0]?.current_period_end),
          trialEndsAt: toDate(sub.trial_end),
        },
      });

      await logWebhookEvent({
        action: `billing.webhook.${event.type.replaceAll(".", "_")}`,
        organizationId: subscription?.organizationId,
        entityId: sub.id,
        meta: {
          eventType: event.type,
          stripeSubscriptionId: sub.id,
          status: sub.status,
          stripePriceId,
          planCode: plan?.code ?? null,
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const subscription = await getSubscriptionContext(sub.id);
      await db.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "canceled" },
      });

      await logWebhookEvent({
        action: "billing.webhook.customer_subscription_deleted",
        organizationId: subscription?.organizationId,
        entityId: sub.id,
        meta: {
          eventType: event.type,
          stripeSubscriptionId: sub.id,
          status: sub.status,
        },
      });
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const { organizationId, userId, stripeSubscriptionId } = await getInvoiceContext(invoice);

      if (stripeSubscriptionId) {
        await db.subscription.updateMany({
          where: { stripeSubscriptionId },
          data: { status: "active" },
        });
      }

      if (organizationId && userId && (invoice.amount_paid ?? 0) > 0) {
        const existingPayment = await db.payment.findFirst({
          where: { stripeSessionId: invoice.id },
          select: { id: true },
        });

        if (!existingPayment) {
          await db.payment.create({
            data: {
              organizationId,
              userId,
              stripePaymentId: null,
              stripeSessionId: invoice.id,
              amountCents: Math.round(invoice.amount_paid ?? 0),
              currency: invoice.currency ?? "usd",
              status: "succeeded",
            },
          }).catch(() => null);
        }
      }

      await logWebhookEvent({
        action: "billing.webhook.invoice_payment_succeeded",
        organizationId,
        entityId: invoice.id,
        meta: {
          eventType: event.type,
          stripeSubscriptionId,
          amountPaid: invoice.amount_paid ?? 0,
          currency: invoice.currency ?? "usd",
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const { organizationId, userId, stripeSubscriptionId } = await getInvoiceContext(invoice);

      if (stripeSubscriptionId) {
        await db.subscription.updateMany({
          where: { stripeSubscriptionId },
          data: { status: "past_due" },
        });
      }

      if (organizationId && userId) {
        const existingPayment = await db.payment.findFirst({
          where: { stripeSessionId: invoice.id },
          select: { id: true },
        });

        if (!existingPayment) {
          await db.payment.create({
            data: {
              organizationId,
              userId,
              stripePaymentId: null,
              stripeSessionId: invoice.id,
              amountCents: Math.round(invoice.amount_due ?? 0),
              currency: invoice.currency ?? "usd",
              status: "failed",
              errorMessage: "Payment failed",
            },
          }).catch(() => null);
        }
      }

      await logWebhookEvent({
        action: "billing.webhook.invoice_payment_failed",
        organizationId,
        entityId: invoice.id,
        meta: {
          eventType: event.type,
          stripeSubscriptionId,
          amountDue: invoice.amount_due ?? 0,
          currency: invoice.currency ?? "usd",
        },
      });
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;

      let subCtx: { organizationId: string } | null = null;
      if (stripeCustomerId) {
        subCtx = await db.subscription.findFirst({
          where: { stripeCustomerId },
          select: { organizationId: true },
        });
      }
      const organizationId = subCtx?.organizationId ?? null;
      const membership = organizationId
        ? await db.membership.findFirst({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
          })
        : null;

      // Write a payment record for each refund on this charge (dedup by refund.id)
      if (organizationId && membership?.userId) {
        for (const refund of charge.refunds?.data ?? []) {
          const already = await db.payment.findFirst({ where: { stripePaymentId: refund.id }, select: { id: true } });
          if (!already) {
            await db.payment.create({
              data: {
                organizationId,
                userId: membership.userId,
                stripePaymentId: refund.id,
                stripeSessionId: null,
                amountCents: refund.amount,
                currency: refund.currency ?? "usd",
                status: "refunded",
                errorMessage: "Plan downgrade refund",
              },
            }).catch(() => null);
          }
        }
      }

      await logWebhookEvent({
        action: "billing.webhook.charge_refunded",
        organizationId,
        entityId: charge.id,
        meta: {
          eventType: event.type,
          chargeId: charge.id,
          amountRefunded: charge.amount_refunded ?? 0,
          currency: charge.currency ?? "usd",
        },
      });
      break;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await logWebhookEvent({
        action: "billing.webhook.payment_intent_succeeded",
        entityId: intent.id,
        meta: {
          eventType: event.type,
          amount: intent.amount ?? 0,
          currency: intent.currency ?? "usd",
          customer: typeof intent.customer === "string" ? intent.customer : intent.customer?.id ?? null,
          metadata: intent.metadata ?? {},
        },
      });
      break;
    }

    default:
      await logWebhookEvent({
        action: "billing.webhook.ignored_event",
        entityId: event.id,
        meta: {
          eventType: event.type,
        },
      });
      break;
  }
}