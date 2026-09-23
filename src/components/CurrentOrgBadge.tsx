"use client";

import { useEffect, useState } from "react";
import LuxuryHeaderActions from "@/components/LuxuryHeaderActions";

type OrgInfo = {
  id: string;
  name: string;
};

type CurrentOrgBadgeProps = {
  hideActions?: boolean;
};

export default function CurrentOrgBadge({ hideActions = false }: CurrentOrgBadgeProps = {}) {
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
    <>
      <span className="inline-flex items-center gap-1.5 font-medium text-xs text-[#0f1f3d] bg-white/80 px-3 py-1.5 rounded-xl border border-[#c7dcff] shadow-xs">
        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-black text-slate-500 uppercase tracking-wider text-[10px]">Org:</span>
        <span className="font-bold">{org.name}</span>
      </span>
      {!hideActions && <LuxuryHeaderActions />}
    </>
  );
}
