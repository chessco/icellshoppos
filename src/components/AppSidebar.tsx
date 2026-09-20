"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";

type AppSidebarProps = {
  pathname: string;
};

type NavItem = {
  href: string;
  label: string;
  labelKey: string;
  match: "exact" | "prefix";
  primary?: boolean;
};

const memberNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", labelKey: "sidebar.dashboard", match: "exact", primary: true },
  { href: "/inventory", label: "Inventory", labelKey: "sidebar.fullInventory", match: "exact" },
  { href: "/label-designer", label: "Label Designer", labelKey: "sidebar.labelDesigner", match: "exact" },
  { href: "/sales", label: "Sales Checkout", labelKey: "sidebar.salesCheckout", match: "prefix" },
  { href: "/sales/history", label: "Sales History", labelKey: "sidebar.salesHistory", match: "exact" },
  { href: "/credit", label: "Credit", labelKey: "sidebar.credit", match: "exact" },
  { href: "/audit", label: "Register Audit", labelKey: "sidebar.registerAudit", match: "exact" },
  { href: "/repairs", label: "Repairs", labelKey: "sidebar.repairs", match: "prefix" },
  { href: "/inventory-requests", label: "Inventory Requests", labelKey: "sidebar.inventoryRequests", match: "exact" },
  { href: "/purchase-orders", label: "Purchase Orders", labelKey: "sidebar.purchaseOrders", match: "exact" },
  { href: "/data", label: "Data Admin", labelKey: "sidebar.dataAdmin", match: "exact" },
  { href: "/billing", label: "Billing", labelKey: "sidebar.billing", match: "exact" },
  { href: "/profile", label: "Profile", labelKey: "sidebar.profile", match: "exact" },
  { href: "/profile/user-manual", label: "User Manual", labelKey: "sidebar.userManual", match: "exact" },
  { href: "/public-inventory-settings", label: "Public Inventory", labelKey: "sidebar.publicInventory", match: "exact" },
];

const superadminNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", labelKey: "sidebar.dashboard", match: "exact", primary: true },
  { href: "/inventory", label: "Inventory", labelKey: "sidebar.fullInventory", match: "exact" },
  { href: "/sales/history", label: "Sales History", labelKey: "sidebar.salesHistory", match: "exact" },
  { href: "/admin/billing", label: "Billing", labelKey: "sidebar.billing", match: "exact" },
  { href: "/profile", label: "Profile", labelKey: "sidebar.profile", match: "exact" },
  { href: "/profile/user-manual", label: "User Manual", labelKey: "sidebar.userManual", match: "exact" },
  { href: "/admin/plans", label: "Plans", labelKey: "sidebar.plans", match: "exact" },
  { href: "/admin/users", label: "Users", labelKey: "sidebar.users", match: "exact" },
  { href: "/admin/email-settings", label: "Email Settings", labelKey: "sidebar.emailSettings", match: "exact" },
];

const isActiveItem = (item: NavItem, pathname: string) => {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

const itemClass = (active: boolean, primary?: boolean) =>
  [
    "rounded-xl px-3 py-2 text-sm font-medium transition",
    primary
      ? active
        ? "bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)]"
        : "bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white hover:from-[#1d4ed8] hover:to-[#0284c7] hover:shadow-[0_8px_20px_rgba(37,99,235,0.35)]"
      : active
      ? "bg-[#0f1f3d] text-white shadow-[0_6px_18px_rgba(15,31,61,0.25)]"
      : "text-[#1f3563] hover:bg-[#ebf3ff] hover:text-[#12316d]",
  ].join(" ");

export default function AppSidebar({ pathname }: AppSidebarProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingInventoryRequests, setPendingInventoryRequests] = useState(0);
  const [pendingPurchaseRequests, setPendingPurchaseRequests] = useState(0);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [imeicheck2Linked, setImeiCheck2Linked] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadPendingCounts = async () => {
      try {
        const [inventoryResponse, purchaseResponse] = await Promise.all([
          fetch("/api/inventory-requests", { cache: "no-store" }),
          fetch("/api/purchase-orders?status=pending", { cache: "no-store" }),
        ]);

        if (!cancelled) {
          if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json().catch(() => ({}));
            const requests = Array.isArray(inventoryData?.requests) ? inventoryData.requests : [];
            const pendingRequestCount = requests.filter((request: { pendingCount?: unknown; status?: unknown }) => {
              const pendingCount = Number(request.pendingCount ?? 0);
              return (Number.isFinite(pendingCount) && pendingCount > 0) || String(request.status ?? "").toLowerCase() === "pending";
            }).length;
            setPendingInventoryRequests(pendingRequestCount);
          } else {
            setPendingInventoryRequests(0);
          }

          if (purchaseResponse.ok) {
            const purchaseData = await purchaseResponse.json().catch(() => ({}));
            const orders = Array.isArray(purchaseData?.orders) ? purchaseData.orders : [];
            setPendingPurchaseRequests(orders.length);
          } else {
            setPendingPurchaseRequests(0);
          }
        }
      } catch {
        if (!cancelled) {
          setPendingInventoryRequests(0);
          setPendingPurchaseRequests(0);
        }
      }
    };

    void loadPendingCounts();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setIsSuperadmin(Boolean(payload?.session?.isSuperadmin));
        }
      } catch {
        if (!cancelled) {
          setIsSuperadmin(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadIntegrationStatus = async () => {
      try {
        const response = await fetch("/api/org/integrations/imeicheck2", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setImeiCheck2Linked(Boolean(response.ok && payload?.linked));
        }
      } catch {
        if (!cancelled) {
          setImeiCheck2Linked(false);
        }
      }
    };

    void loadIntegrationStatus();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const baseNavItems = isSuperadmin ? superadminNavItems : memberNavItems;
  const navItems = imeicheck2Linked
    ? [...baseNavItems, { href: "/imeicheck2", label: "IMEICHECK2.COM", labelKey: "sidebar.imeicheck2", match: "exact" as const }]
    : baseNavItems;

  const getPendingBadge = (href: string) => {
    if (href === "/inventory-requests" && pendingInventoryRequests > 0) {
      return pendingInventoryRequests;
    }
    if (href === "/purchase-orders" && pendingPurchaseRequests > 0) {
      return pendingPurchaseRequests;
    }
    return 0;
  };

  return (
    <>
      <div className="border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.92)] px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <Link
            href="https://www.probuyer.org"
            className="inline-flex items-center"
          >
            <img
              src="/api/public/app-brand-logo"
              alt="Website logo"
              className="h-6 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            className="inline-flex items-center justify-center rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm font-semibold text-[#1f3563]"
          >
            {menuOpen ? t("sidebar.close", "Close") : t("sidebar.menu", "Menu")}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-[rgba(15,31,61,0.38)]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-[82%] max-w-[320px] border-l border-[#d6e4ff] bg-[linear-gradient(180deg,#ffffff,#eff7ff)] p-4 shadow-[0_20px_40px_rgba(15,31,61,0.25)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4b6292]">{t("sidebar.navigation", "Navigation")}</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border border-[#bfd4ff] px-2 py-1 text-xs font-semibold text-[#1f3563]"
              >
                {t("sidebar.close", "Close")}
              </button>
            </div>
            <nav className="grid gap-2">
              {navItems.map((item) => {
                const active = isActiveItem(item, pathname);
                const badgeCount = getPendingBadge(item.href);
                return (
                  <Link key={item.href} href={item.href} className={itemClass(active, item.primary)}>
                    <span className="inline-flex items-center justify-between gap-2 w-full">
                      <span>{t(item.labelKey, item.label)}</span>
                      {badgeCount > 0 && (
                        <span className="rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                          {badgeCount}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <aside className="hidden border-r border-[#d6e4ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,247,255,0.92))] p-3 md:block md:sticky md:top-0 md:h-screen">
        <div className="px-2 py-2">
          <Link
            href="https://www.probuyer.org"
            className="inline-flex items-center"
          >
            <img
              src="/api/public/app-brand-logo"
              alt="Website logo"
              className="h-6 w-auto max-w-[160px] object-contain"
            />
          </Link>
        </div>
        <nav className="mt-2 grid gap-1">
          {navItems.map((item) => {
            const active = isActiveItem(item, pathname);
            const badgeCount = getPendingBadge(item.href);
            return (
              <Link key={item.href} href={item.href} className={itemClass(active, item.primary)}>
                <span className="inline-flex items-center justify-between gap-2 w-full">
                  <span>{t(item.labelKey, item.label)}</span>
                  {badgeCount > 0 && (
                    <span className="rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                      {badgeCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
