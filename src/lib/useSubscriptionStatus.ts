"use client";

import { useEffect, useState } from "react";

export function useSubscriptionStatus() {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/org/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const sub = data?.organization?.subscriptions?.[0];
        if (!sub) { setIsActive(false); return; }
        if (sub.status === "active") { setIsActive(true); return; }
        if (sub.status === "trialing") {
          setIsActive(!sub.trialEndsAt || new Date(sub.trialEndsAt) > new Date());
          return;
        }
        setIsActive(false);
      })
      .catch(() => setIsActive(false))
      .finally(() => setLoading(false));
  }, []);

  return { isActive, loading };
}
