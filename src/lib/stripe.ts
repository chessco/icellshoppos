import Stripe from "stripe";
import { db } from "@/lib/db";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy_build_key", {
  apiVersion: "2026-02-25.clover" as any,
});

/**
 * Returns a Stripe client configured with either the organization's custom Stripe Secret Key
 * or the default system environment variable.
 */
export async function getStripeForOrg(organizationId?: string): Promise<Stripe> {
  if (!organizationId) {
    return stripe;
  }
  try {
    const customKeySetting = await db.systemSetting.findUnique({
      where: { key: `integration:${organizationId}:stripe_secret_key` },
    });
    if (customKeySetting?.value && customKeySetting.value.trim().startsWith("sk_")) {
      return new Stripe(customKeySetting.value.trim(), {
        apiVersion: "2026-02-25.clover" as any,
      });
    }
  } catch (err) {
    console.error("[getStripeForOrg] Failed to query custom Stripe key, using default:", err);
  }
  return stripe;
}

