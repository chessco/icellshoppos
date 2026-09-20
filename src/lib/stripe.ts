import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy_build_key", {
  apiVersion: "2026-02-25.clover",
});

