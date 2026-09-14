import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireSession } from "@/lib/server-auth";
import { getStripePriceIdForPlan, isStripePriceId, isStripeProductId } from "@/lib/billing-plans";

function getRequestOrigin(req: NextRequest) {
  // Prefer explicit env var — avoids apex DNS inconsistency (e.g. probuyer.org
  // has multiple A records; only Render ones have the correct TLS cert).
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`.replace(/\/$/, "");
  }

  return req.nextUrl.origin.replace(/\/$/, "");
}

async function resolveCheckoutPriceId(billingId: string) {
  if (isStripePriceId(billingId)) {
    return billingId;
  }

  if (!isStripeProductId(billingId)) {
    console.warn("[billing] resolveCheckoutPriceId: not a price or product ID", { billingId });
    return null;
  }

  const prices = await stripe.prices.list({
    product: billingId,
    active: true,
    type: "recurring",
    limit: 10,
  });

  console.info("[billing] resolveCheckoutPriceId", { billingId, found: prices.data.map(p => ({ id: p.id, interval: p.recurring?.interval })) });

  const monthly = prices.data.find((price) => price.recurring?.interval === "month");
  const picked = monthly ?? prices.data[0] ?? null;
  return picked?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const appUrl = getRequestOrigin(req);
    const session = await requireSession(req);
    const { planId, returnUrl, isUpgrade } = await req.json();
    const safeReturnPath = typeof returnUrl === "string" && returnUrl.startsWith("/") ? returnUrl : "/billing";
    const resolvedReturn = `${appUrl}${safeReturnPath}`;

    // Lookup current subscription for the organization
    // (Assume you have a db import and a subscription model)
    const db = (await import("@/lib/db")).db;
    const organizationId = session.activeOrganizationId;
    let currentSubscription = null;
    if (organizationId) {
      currentSubscription = await db.subscription.findFirst({
        where: { organizationId },
      });
    }
    // Resolve the target plan + price first (needed for both upgrade and new checkout paths)
    const normalizedPlanId = planId ? String(planId).trim() : null;
    const targetPlan = normalizedPlanId
      ? await db.plan.findFirst({
          where: {
            OR: [
              { stripePriceId: normalizedPlanId },
              { code: normalizedPlanId.toLowerCase() },
            ],
          },
        })
      : null;
    const billingId = targetPlan
      ? getStripePriceIdForPlan(targetPlan.code, targetPlan.stripePriceId)
      : normalizedPlanId;
    const resolvedPriceId = billingId ? await resolveCheckoutPriceId(billingId) : null;

    // If user already has a live Stripe subscription:
    //   - upgrading/downgrading to a different plan → update subscription directly via API
    //   - no specific target plan (manage button) → open plain portal
    if (currentSubscription?.stripeSubscriptionId && currentSubscription?.stripeCustomerId) {
      if (resolvedPriceId) {
        const stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId);
        const currentPriceId = stripeSub.items.data[0]?.price?.id;
        const currentItemId = stripeSub.items.data[0]?.id;

        console.info("[billing] upgrade check", { resolvedPriceId, currentPriceId, currentItemId, planId });

        if (currentPriceId === resolvedPriceId || !currentItemId) {
          // Same plan — return a clear error instead of silently opening portal
          return NextResponse.json({ error: "You are already on this plan." }, { status: 400 });
        }

        if (!isUpgrade) {
          // DOWNGRADE: preview credit, switch plan without Stripe proration invoice, issue actual card refund
          const prorationDate = Math.floor(Date.now() / 1000);
          let refundAmountCents = 0;

          try {
            const preview = await stripe.invoices.createPreview({
              customer: currentSubscription.stripeCustomerId,
              subscription: currentSubscription.stripeSubscriptionId,
              subscription_details: {
                items: [{ id: currentItemId, price: resolvedPriceId }],
                proration_behavior: "always_invoice",
                proration_date: prorationDate,
              },
            });
            if ((preview.total ?? 0) < 0) {
              refundAmountCents = Math.abs(preview.total ?? 0);
            }
          } catch (previewErr) {
            console.warn("[billing] proration preview failed, no refund calc", previewErr);
          }

          // Switch plan with no Stripe credit invoice — we refund manually
          await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
            items: [{ id: currentItemId, price: resolvedPriceId }],
            proration_behavior: "none",
          });

          if (refundAmountCents > 0) {
            try {
              const charges = await stripe.charges.list({ customer: currentSubscription.stripeCustomerId, limit: 10 });
              const lastCharge = charges.data.find(
                (c) => c.paid && c.status === "succeeded" && c.amount > (c.amount_refunded ?? 0)
              );
              if (lastCharge) {
                const maxRefundable = lastCharge.amount - (lastCharge.amount_refunded ?? 0);
                const actualRefund = Math.min(refundAmountCents, maxRefundable);
                if (actualRefund > 0) {
                  const refund = await stripe.refunds.create({ charge: lastCharge.id, amount: actualRefund });
                  // Write payment record immediately; webhook will skip if it fires (dedup by refund.id)
                  const org = await db.subscription.findFirst({
                    where: { stripeCustomerId: currentSubscription.stripeCustomerId },
                    select: { organizationId: true },
                  });
                  if (org?.organizationId && session.userId) {
                    await db.payment.create({
                      data: {
                        organizationId: org.organizationId,
                        userId: session.userId,
                        stripePaymentId: refund.id,
                        stripeSessionId: null,
                        amountCents: actualRefund,
                        currency: refund.currency ?? "usd",
                        status: "refunded",
                        errorMessage: "Plan downgrade refund",
                      },
                    }).catch(() => null);
                  }
                  refundAmountCents = actualRefund;
                  console.info("[billing] downgrade refund issued", { refundId: refund.id, amount: actualRefund });
                } else {
                  refundAmountCents = 0;
                }
              } else {
                refundAmountCents = 0;
              }
            } catch (refundErr) {
              console.error("[billing] refund failed", refundErr);
              refundAmountCents = 0;
            }
          }

          console.info("[billing] subscription downgraded", { from: currentPriceId, to: resolvedPriceId, refundAmountCents });
          return NextResponse.json({ upgraded: true, refundedCents: refundAmountCents });
        }

        // UPGRADE: charge prorated difference immediately
        await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
          items: [{ id: currentItemId, price: resolvedPriceId }],
          proration_behavior: "always_invoice",
        });

        console.info("[billing] subscription upgraded", { from: currentPriceId, to: resolvedPriceId });
        return NextResponse.json({ upgraded: true });
      }

      console.info("[billing] no resolvedPriceId, opening plain portal", { planId });

      // No specific plan target — plain portal for subscription management
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: currentSubscription.stripeCustomerId,
        return_url: resolvedReturn,
      });
      return NextResponse.json({ url: portalSession.url });
    }

    if (!resolvedPriceId) {
      return NextResponse.json({ error: "Selected plan is not configured for Stripe checkout." }, { status: 400 });
    }

    // No Stripe subscription yet — create a new checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId: session.userId,
          organizationId: session.activeOrganizationId || "",
        },
      },
      ...(currentSubscription?.stripeCustomerId
        ? { customer: currentSubscription.stripeCustomerId }
        : { customer_email: session.email }),
      success_url: `${resolvedReturn}?success=1`,
      cancel_url: `${resolvedReturn}?canceled=1`,
      metadata: {
        userId: session.userId,
        organizationId: session.activeOrganizationId || "",
      },
    });

    console.info("[billing] Stripe checkout URLs", {
      planId: normalizedPlanId,
      appUrl,
      success_url: `${resolvedReturn}?success=1`,
      cancel_url: `${resolvedReturn}?canceled=1`,
      checkoutSessionId: checkoutSession.id,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create Stripe session" }, { status: 500 });
  }
}
