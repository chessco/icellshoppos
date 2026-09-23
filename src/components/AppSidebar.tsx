"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";

type AppSidebarProps = {
  pathname: string;
};

type NavSubItem = {
  href: string;
  label: string;
  labelKey: string;
};

type NavItem = {
  href: string;
  label: string;
  labelKey: string;
  match: "exact" | "prefix";
  primary?: boolean;
  children?: NavSubItem[];
};

const isSubActive = (subHref: string, pathname: string) => {
  if (subHref === "/sales") {
    return pathname === "/sales";
  }
  if (subHref === "/inventory") {
    return pathname === "/inventory";
  }
  return pathname === subHref || pathname.startsWith(`${subHref}/`);
};

const memberNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", labelKey: "sidebar.dashboard", match: "exact", primary: true },
  {
    href: "/inventory",
    label: "Inventory",
    labelKey: "sidebar.inventory",
    match: "prefix",
    children: [
      { href: "/inventory", label: "Full Inventory", labelKey: "sidebar.fullInventory" },
      { href: "/inventory-requests", label: "Inventory Requests", labelKey: "sidebar.inventoryRequests" },
      { href: "/public-inventory-settings", label: "Public Inventory", labelKey: "sidebar.publicInventory" },
    ],
  },
  {
    href: "/sales",
    label: "Sales",
    labelKey: "sidebar.sales",
    match: "prefix",
    children: [
      { href: "/sales", label: "Sales Checkout", labelKey: "sidebar.salesCheckout" },
      { href: "/sales/history", label: "Sales History", labelKey: "sidebar.salesHistory" },
      { href: "/sales/authorizations", label: "Discount Approvals", labelKey: "sidebar.discountAuthorizations" },
      { href: "/commissions", label: "Commissions", labelKey: "sidebar.commissions" },
      { href: "/label-designer", label: "Label Designer", labelKey: "sidebar.labelDesigner" },
    ],
  },
  { href: "/messages", label: "Messages", labelKey: "sidebar.messages", match: "exact" },
  { href: "/credit", label: "Credit", labelKey: "sidebar.credit", match: "exact" },
  { href: "/audit", label: "Register Audit", labelKey: "sidebar.registerAudit", match: "exact" },
  { href: "/repairs", label: "Repairs", labelKey: "sidebar.repairs", match: "prefix" },
  { href: "/purchase-orders", label: "Purchase Orders", labelKey: "sidebar.purchaseOrders", match: "exact" },
  { href: "/data", label: "Data Admin", labelKey: "sidebar.dataAdmin", match: "exact" },
  { href: "/billing", label: "Billing", labelKey: "sidebar.billing", match: "exact" },
  { href: "/profile", label: "Profile", labelKey: "sidebar.profile", match: "exact" },
  { href: "/profile/user-manual", label: "User Manual", labelKey: "sidebar.userManual", match: "exact" },
  {
    href: "/settings",
    label: "Settings",
    labelKey: "sidebar.settings",
    match: "prefix",
    children: [
      { href: "/settings/integrations", label: "Integrations", labelKey: "sidebar.integrations" },
    ],
  },
];

const superadminNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", labelKey: "sidebar.dashboard", match: "exact", primary: true },
  {
    href: "/inventory",
    label: "Inventory",
    labelKey: "sidebar.inventory",
    match: "prefix",
    children: [
      { href: "/inventory", label: "Full Inventory", labelKey: "sidebar.fullInventory" },
      { href: "/inventory-requests", label: "Inventory Requests", labelKey: "sidebar.inventoryRequests" },
      { href: "/public-inventory-settings", label: "Public Inventory", labelKey: "sidebar.publicInventory" },
    ],
  },
  {
    href: "/sales",
    label: "Sales",
    labelKey: "sidebar.sales",
    match: "prefix",
    children: [
      { href: "/sales", label: "Sales Checkout", labelKey: "sidebar.salesCheckout" },
      { href: "/sales/history", label: "Sales History", labelKey: "sidebar.salesHistory" },
      { href: "/sales/authorizations", label: "Discount Approvals", labelKey: "sidebar.discountAuthorizations" },
      { href: "/commissions", label: "Commissions", labelKey: "sidebar.commissions" },
      { href: "/label-designer", label: "Label Designer", labelKey: "sidebar.labelDesigner" },
    ],
  },
  { href: "/messages", label: "Messages", labelKey: "sidebar.messages", match: "exact" },
  { href: "/admin/billing", label: "Billing", labelKey: "sidebar.billing", match: "exact" },
  { href: "/profile", label: "Profile", labelKey: "sidebar.profile", match: "exact" },
  { href: "/profile/user-manual", label: "User Manual", labelKey: "sidebar.userManual", match: "exact" },
  { href: "/admin/plans", label: "Plans", labelKey: "sidebar.plans", match: "exact" },
  { href: "/admin/users", label: "Users", labelKey: "sidebar.users", match: "exact" },
  { href: "/admin/email-settings", label: "Email Settings", labelKey: "sidebar.emailSettings", match: "exact" },
  {
    href: "/settings",
    label: "Settings",
    labelKey: "sidebar.settings",
    match: "prefix",
    children: [
      { href: "/settings/integrations", label: "Integrations", labelKey: "sidebar.integrations" },
    ],
  },
];

const isActiveItem = (item: NavItem, pathname: string) => {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  if (item.children?.some((child) => isSubActive(child.href, pathname))) {
    return true;
  }
  return false;
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

const subItemClass = (active: boolean) =>
  [
    "rounded-xl py-1 px-2.5 text-xs font-semibold transition flex items-center gap-1.5",
    active
      ? "bg-[#2563eb] text-white shadow-sm"
      : "text-[#3b5998] hover:bg-[#dbeafe] hover:text-[#0f1f3d]",
  ].join(" ");

export default function AppSidebar({ pathname }: AppSidebarProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingInventoryRequests, setPendingInventoryRequests] = useState(0);
  const [pendingPurchaseRequests, setPendingPurchaseRequests] = useState(0);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [canManageCommissions, setCanManageCommissions] = useState(false);
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
          const isSuper = Boolean(payload?.session?.isSuperadmin);
          setIsSuperadmin(isSuper);
          const role = payload?.role || payload?.session?.role;
          const hasCommPerm = payload?.permissions?.canManageCommissions === true;
          setCanManageCommissions(isSuper || role === "superadmin" || role === "admin" || hasCommPerm);
        }
      } catch {
        if (!cancelled) {
          setIsSuperadmin(false);
          setCanManageCommissions(false);
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

  const rawNavItems = isSuperadmin ? superadminNavItems : memberNavItems;
  const baseNavItems = rawNavItems
    .map((item) => {
      if (item.children) {
        const filteredChildren = item.children.filter((child) => {
          if (child.href === "/commissions" && !canManageCommissions) {
            return false;
          }
          return true;
        });
        return { ...item, children: filteredChildren };
      }
      return item;
    })
    .filter((item) => {
      if (item.href === "/commissions" && !canManageCommissions) {
        return false;
      }
      return true;
    });
  const navItems: NavItem[] = (() => {
    if (!imeicheck2Linked) return baseNavItems;
    const items: NavItem[] = [...baseNavItems];
    const settingsIdx = items.findIndex((i) => i.href === "/settings");
    const imeicheckItem: NavItem = { href: "/imeicheck2", label: "IMEICHECK2.COM", labelKey: "sidebar.imeicheck2", match: "exact" };
    if (settingsIdx !== -1) {
      items.splice(settingsIdx, 0, imeicheckItem);
      return items;
    }
    return [...items, imeicheckItem];
  })();

  const getPendingBadge = (href: string) => {
    if ((href === "/inventory" || href === "/inventory-requests") && pendingInventoryRequests > 0) {
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
                  <div key={item.href} className="flex flex-col">
                    <Link href={item.href} className={itemClass(active, item.primary)}>
                      <span className="inline-flex items-center justify-between gap-2 w-full">
                        <span className="inline-flex items-center gap-1.5">
                          {item.labelKey === "sidebar.settings" && <span className="text-xs">⚙️</span>}
                          <span>{t(item.labelKey, item.label)}</span>
                        </span>
                        {badgeCount > 0 && (
                          <span className="rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                            {badgeCount}
                          </span>
                        )}
                      </span>
                    </Link>
                    {item.children && item.children.length > 0 && (
                      <div className="ml-3 pl-2.5 border-l-2 border-[#bfd4ff] flex flex-col gap-1 my-1.5">
                        {item.children.map((sub) => {
                          const subActive = isSubActive(sub.href, pathname);
                          const subBadge = getPendingBadge(sub.href);
                          return (
                            <Link key={sub.href} href={sub.href} className={subItemClass(subActive)}>
                              <span className="text-slate-400 text-[10px]">↳</span>
                              <span className="flex-1">{t(sub.labelKey, sub.label)}</span>
                              {subBadge > 0 && (
                                <span className="rounded-full bg-[#ef4444] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                                  {subBadge}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
              <div key={item.href} className="flex flex-col">
                <Link href={item.href} className={itemClass(active, item.primary)}>
                  <span className="inline-flex items-center justify-between gap-2 w-full">
                    <span className="inline-flex items-center gap-1.5">
                      {item.labelKey === "sidebar.settings" && <span className="text-xs">⚙️</span>}
                      <span>{t(item.labelKey, item.label)}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span className="rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                        {badgeCount}
                      </span>
                    )}
                  </span>
                </Link>
                {item.children && item.children.length > 0 && (
                  <div className="ml-3 pl-2.5 border-l-2 border-[#bfd4ff] flex flex-col gap-1 my-1.5">
                    {item.children.map((sub) => {
                      const subActive = isSubActive(sub.href, pathname);
                      const subBadge = getPendingBadge(sub.href);
                      return (
                        <Link key={sub.href} href={sub.href} className={subItemClass(subActive)}>
                          <span className="text-slate-400 text-[10px]">↳</span>
                          <span className="flex-1">{t(sub.labelKey, sub.label)}</span>
                          {subBadge > 0 && (
                            <span className="rounded-full bg-[#ef4444] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                              {subBadge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
