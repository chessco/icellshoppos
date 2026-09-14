"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatBatteryPercentage, formatCurrencyDisplay } from "@/lib/display-format";
import { useSubscriptionStatus } from "@/lib/useSubscriptionStatus";
import ToolUnavailableBanner from "@/components/ToolUnavailableBanner";

type Settings = {
  enabled: boolean;
  slug: string;
  columns: string[];
  planTier?: "free" | "basic" | "pro";
  slugEditable?: boolean;
  generatedSlug?: string;
  suggestedSlugFromName?: string;
};

type InventoryItem = {
  imei: string;
  model?: string;
  capacity?: string;
  color?: string;
  carrier?: string;
  condition?: string;
  grade?: string;
  supplier?: string;
  dateOfPurchase?: string;
  cost?: string;
  costCurrency?: string;
  batteryHealth?: string;
  cycleCount?: string;
  iosVersion?: string;
  serialNumber?: string;
  comments?: string;
  price?: string;
  price2?: string;
  price3?: string;
  status?: string;
  createdAt?: string;
};

const AVAILABLE_COLUMNS = [
  { key: "allowOffers", label: "Allow Offers" },
  { key: "imei", label: "IMEI" },
  { key: "model", label: "Model" },
  { key: "capacity", label: "Capacity" },
  { key: "color", label: "Color" },
  { key: "carrier", label: "Carrier" },
  { key: "condition", label: "Condition" },
  { key: "grade", label: "Grade" },
  { key: "supplier", label: "Supplier" },
  { key: "site", label: "Site" },
  { key: "dateOfPurchase", label: "Date Of Purchase" },
  { key: "cost", label: "Cost" },
  { key: "costCurrency", label: "Cost Currency" },
  { key: "price", label: "Price" },
  { key: "price2", label: "Price 2" },
  { key: "price3", label: "Price 3" },
  { key: "status", label: "Status" },
  { key: "batteryHealth", label: "Battery Health" },
  { key: "cycleCount", label: "Cycle Count" },
  { key: "iosVersion", label: "iOS Version" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "comments", label: "Comments" },
  { key: "createdAt", label: "Created" },
];

export default function PublicInventorySettingsPage() {
  const pathname = usePathname();
  const { isActive, loading: subLoading } = useSubscriptionStatus();
  const [settings, setSettings] = useState<Settings>({
    enabled: false,
    slug: "",
    columns: AVAILABLE_COLUMNS.map((c) => c.key),
    planTier: "free",
    slugEditable: false,
    generatedSlug: "",
    suggestedSlugFromName: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [previewItems, setPreviewItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    loadSettings();
    loadPreview();
  }, []);

  useEffect(() => {
    if (settings.slug) {
      loadPreview();
    }
  }, [settings.enabled, settings.slug]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/public-inventory-settings");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load settings");
      }
      const data = await response.json();
      setSettings({
        enabled: data.enabled ?? false,
        slug: data.slug ?? "",
        columns: data.columns ?? AVAILABLE_COLUMNS.map((c) => c.key),
        planTier: data.planTier ?? "free",
        slugEditable: data.slugEditable ?? false,
        generatedSlug: data.generatedSlug ?? "",
        suggestedSlugFromName: data.suggestedSlugFromName ?? "",
      });
      if (data.slug) {
        setPublicUrl(`${window.location.origin}/${data.slug}`);
      }
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    try {
      const response = await fetch("/api/inventory?status=Available");
      if (!response.ok) return;
      const data = await response.json();
      const items = (data.inventoryItems || []).slice(0, 5).map((item: any) => ({
        imei: item.imei,
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        carrier: item.carrier,
        condition: item.condition,
        grade: item.grade,
        supplier: item.supplier?.name,
        dateOfPurchase: item.dateOfPurchase,
        cost: item.costPesos?.toString(),
        costCurrency: item.costCurrency || "MXN",
        price: item.price?.toString(),
        price2: item.price2?.toString(),
        price3: item.price3?.toString(),
        status: item.status,
        batteryHealth: item.batteryHealth,
        cycleCount: item.cycleCount?.toString(),
        iosVersion: item.iosVersion,
        serialNumber: item.serialNumber,
        comments: item.comments,
        createdAt: item.createdAt,
      }));
      setPreviewItems(items);
    } catch (error) {
      console.error("Failed to load preview:", error);
    }
  };

  const handleSave = async () => {
    if (settings.enabled && settings.slugEditable && !settings.slug.trim()) {
      setStatus("Slug is required when public inventory is enabled");
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/public-inventory-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }
      const data = await response.json();
      setSettings({
        enabled: data.enabled,
        slug: data.slug,
        columns: data.columns,
        planTier: data.planTier ?? settings.planTier,
        slugEditable: data.slugEditable ?? settings.slugEditable,
        generatedSlug: data.generatedSlug ?? settings.generatedSlug,
        suggestedSlugFromName: data.suggestedSlugFromName ?? settings.suggestedSlugFromName,
      });
      if (data.slug) {
        setPublicUrl(`${window.location.origin}/${data.slug}`);
      }
      setStatus("Saved successfully ✓");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleColumn = (columnKey: string) => {
    setSettings((prev) => {
      const columns = prev.columns.includes(columnKey)
        ? prev.columns.filter((c) => c !== columnKey)
        : [...prev.columns, columnKey];
      return { ...prev, columns };
    });
  };

  const copyToClipboard = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl).then(() => {
        setStatus("URL copied to clipboard ✓");
        setTimeout(() => setStatus(""), 2000);
      });
    }
  };

  const renderPreviewValue = (item: InventoryItem, colKey: string) => {
    const value = item[colKey as keyof InventoryItem];
    if (["cost", "price", "price2", "price3"].includes(colKey)) {
      return formatCurrencyDisplay(value);
    }
    if (["dateOfPurchase", "createdAt"].includes(colKey)) {
      if (!value) return "-";
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-US");
    }
    if (colKey === "batteryHealth") return formatBatteryPercentage(value);
    return value || "-";
  };

  if (loading) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
            <p className="text-sm text-[#6a4d3a]">Loading settings...</p>
          </main>
        </div>
      </div>
    );
  }

  if (!subLoading && isActive === false) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
            <CurrentOrgBadge />
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
            <ToolUnavailableBanner toolName="Public Inventory" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
          <span>Status: {settings.enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Public Inventory</h1>
            <p className="text-sm text-[#6a4d3a]">
              Share your inventory publicly with a custom URL. No login required for customers.
            </p>
          </header>

          {/* Settings Section */}
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16]">Settings</h2>
            <div className="mt-4 space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="w-5 h-5 accent-[#ff6b4a]"
                  />
                  <span className="text-sm font-semibold text-[#1f1a16]">Enable Public Inventory</span>
                </label>
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-semibold text-[#1f1a16] mb-2">
                  Public URL Slug
                </label>
                <p className="text-xs text-[#6a4d3a] mb-2">
                  Your public inventory will be available at: /
                  {settings.slug || settings.generatedSlug || "your-slug"}
                </p>
                <input
                  type="text"
                  value={settings.slug}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))
                  }
                  placeholder={settings.slugEditable ? "your-company-name" : settings.generatedSlug || "org-xxxxxxxxxxxx"}
                  className="border border-[#d6c1ad] rounded px-3 py-2 w-full max-w-md text-sm"
                  disabled={!settings.enabled || !settings.slugEditable}
                />
                {!settings.slugEditable && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <p className="text-xs text-[#6a4d3a]">
                      Custom slug editing is available on Pro plan only. Free and Basic plans use your assigned public code.
                    </p>
                    <p className="text-xs text-[#6a4d3a]">
                      Your slug could be: probuyer.org/(<span className="font-semibold">{settings.suggestedSlugFromName || "users-company-name"}</span>)
                    </p>
                    <a
                      href="/billing"
                      className="rounded-full bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                    >
                      Upgrade to Pro
                    </a>
                  </div>
                )}
                {publicUrl && settings.enabled && (
                  <div className="mt-2 flex items-center gap-2">
                    <a
                      href={`/${settings.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#ff6b4a] hover:underline"
                    >
                      {publicUrl}
                    </a>
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1 border border-[#d6c1ad] rounded text-xs font-semibold text-[#3b2a1e] hover:bg-[#fff6ea]"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>

              {/* Column Selection */}
              <div>
                <label className="block text-sm font-semibold text-[#1f1a16] mb-2">
                  Visible Columns
                </label>
                <p className="text-xs text-[#6a4d3a] mb-3">
                  Select which columns appear in your public inventory view
                </p>
                <div className="space-y-2">
                  {AVAILABLE_COLUMNS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.columns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        disabled={!settings.enabled}
                        className="w-4 h-4 accent-[#ff6b4a]"
                      />
                      <span className="text-sm text-[#3b2a1e]">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-[#ff6b4a] px-6 py-2 text-sm font-semibold text-white hover:bg-[#e2573a] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
                {status && (
                  <span className={status.includes("✓") ? "text-sm text-green-600" : "text-sm text-red-600"}>
                    {status}
                  </span>
                )}
              </div>

              {/* Info Box */}
              <div className="rounded-lg bg-[#fff6ea] border border-[#e6d6c6] p-4">
                <p className="text-xs text-[#5c4332]">
                  <strong>Note:</strong> Public inventory is only visible when your organization has an active or trial subscription.
                  The public page does not require login and shows only "Available" items.
                </p>
                {settings.planTier !== "pro" && (
                  <p className="mt-2 text-xs text-[#5c4332]">
                    Current plan: <strong>{(settings.planTier || "free").toUpperCase()}</strong>. Public URL code: <strong>/{settings.generatedSlug || settings.slug}</strong>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Preview Section */}
          {settings.enabled && settings.slug && (
            <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#1f1a16]">Preview</h2>
                  <p className="text-xs text-[#6a4d3a]">How customers will see your inventory</p>
                </div>
                <a
                  href={`/${settings.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e] hover:bg-[#fff6ea]"
                >
                  Open Full Page ↗
                </a>
              </div>

              <div className="rounded-lg border border-[#e6d6c6] overflow-hidden">
                {previewItems.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#6a4d3a]">
                    No available items to preview. Add inventory items to see them here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#fff6ea] border-b border-[#e6d6c6]">
                        <tr>
                          {settings.columns.filter((colKey) => colKey !== "allowOffers").map((colKey) => {
                            const col = AVAILABLE_COLUMNS.find((c) => c.key === colKey);
                            return col ? (
                              <th key={colKey} className="text-left px-4 py-3 font-semibold text-[#1f1a16]">
                                {col.label}
                              </th>
                            ) : null;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, index) => (
                          <tr key={item.imei || index} className="border-b border-[#e6d6c6] last:border-0 hover:bg-[#fffbf5]">
                            {settings.columns.filter((colKey) => colKey !== "allowOffers").map((colKey) => {
                              return (
                                <td key={colKey} className="px-4 py-3 text-[#3b2a1e]">
                                  {renderPreviewValue(item, colKey)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <p className="text-xs text-[#6a4d3a] mt-3">Showing up to 5 available items as preview</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

