/**
 * Returns true if the subscription is currently active:
 *   - status "active" (paid), or
 *   - status "trialing" with a trial end date in the future
 */
export function isSubscriptionActive(sub: {
  status: string;
  trialEndsAt?: Date | string | null;
} | null | undefined): boolean {
  if (!sub) return false;
  if (sub.status === "active") return true;
  if (sub.status === "trialing") {
    if (!sub.trialEndsAt) return true; // no expiry set → still active
    return new Date(sub.trialEndsAt) > new Date();
  }
  return false;
}
