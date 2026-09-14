"use client";

import { useEffect, useState } from "react";

type OrgInfo = {
  id: string;
  name: string;
};

export default function CurrentOrgBadge() {
  const [org, setOrg] = useState<OrgInfo | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;

        const data = await response.json();
        const activeId = data?.session?.activeOrganizationId as string | undefined;
        const organizations = (data?.organizations ?? []) as Array<{ id: string; name: string }>;

        if (!activeId || !mounted) return;

        const active = organizations.find((item) => item.id === activeId);
        if (active && mounted) {
          setOrg({ id: active.id, name: active.name ?? active.id });
        }
      } catch {
        // Ignore badge load errors
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!org) return null;

  return (
    <span>
      <span className="font-semibold">Org:</span> {org.name}
    </span>
  );
}
