export const DEFAULT_STRIPE_BILLING_IDS = {
  free: "prod_U300umxEALxSCp",
  basic: "prod_U2zyMxuyYAxWuA",
  pro: "prod_U2zyP4ufWNwjEC",
  extra_seat: "prod_U83tpiBa5Qpso3",
} as const;

export function getStripePriceIdForPlan(code: string, stripePriceId?: string | null) {
  // Always prefer the hardcoded product IDs for known plans.
  // These are canonical live Stripe product IDs and get resolved to the current
  // active price at checkout time via resolveCheckoutPriceId().
  // This prevents stale seeded price_ IDs from overriding them.
  const normalizedCode = code.toLowerCase() as keyof typeof DEFAULT_STRIPE_BILLING_IDS;
  if (DEFAULT_STRIPE_BILLING_IDS[normalizedCode]) {
    return DEFAULT_STRIPE_BILLING_IDS[normalizedCode];
  }

  // For unrecognised plan codes fall back to whatever is in the DB.
  if (stripePriceId) return stripePriceId;
  return null;
}

export function isStripePriceId(value: string) {
  return value.startsWith("price_");
}

export function isStripeProductId(value: string) {
  return value.startsWith("prod_");
}