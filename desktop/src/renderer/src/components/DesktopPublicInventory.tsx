import { useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

type ColumnDef = {
  key: string;
  label: string;
};

const AVAILABLE_COLUMNS: ColumnDef[] = [
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

const DEFAULT_COLUMNS = AVAILABLE_COLUMNS.map((entry) => entry.key);

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-US");
};

const formatMoney = (value: string | number | null | undefined) => {
  if (value == null || value === "") return "-";
  const parsed = Number(String(value));
  if (!Number.isFinite(parsed)) return String(value);
  return `$${Math.round(parsed).toLocaleString("en-US")}`;
};

const getCellValue = (item: DesktopInventoryListItem, key: string) => {
  if (key === "supplier") return item.supplier?.name || "-";
  if (key === "site") return item.site?.name || "-";
  if (key === "dateOfPurchase") return formatDate((item as unknown as { dateOfPurchase?: string }).dateOfPurchase);
  if (key === "createdAt") return formatDate(item.createdAt);
  if (key === "cost") return formatMoney(item.costPesos);
  if (key === "price") return formatMoney(item.price);
  if (key === "price2") return formatMoney(item.price2);
  if (key === "price3") return formatMoney(item.price3);

  const value = (item as unknown as Record<string, unknown>)[key];
  if (value == null || value === "") return "-";
  return String(value);
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

export function DesktopPublicInventory({ baseUrl, signedIn }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<DesktopPublicInventorySettings>({
    enabled: false,
    slug: "",
    columns: [...DEFAULT_COLUMNS],
    planTier: "free",
    slugEditable: false,
    generatedSlug: "",
    suggestedSlugFromName: "",
  });

  const [previewItems, setPreviewItems] = useState<DesktopInventoryListItem[]>([]);

  const publicUrl = useMemo(() => {
    const slug = String(settings.slug ?? "").trim();
    if (!slug) return "";
    return `${normalizeBaseUrl(baseUrl)}/${slug}`;
  }, [baseUrl, settings.slug]);

  const previewColumns = useMemo(
    () => settings.columns.filter((column) => column !== "allowOffers"),
    [settings.columns]
  );

  const loadSettings = async () => {
    if (!signedIn) {
      setError("Sign in to configure Public Inventory.");
      setLoading(false);
      return;
    }

    if (!window.desktop?.publicInventory?.getSettings) {
      setError("Desktop bridge is outdated. Restart the desktop app to load Public Inventory support.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await window.desktop.publicInventory.getSettings({ baseUrl });
      setSettings({
        enabled: Boolean(data.enabled),
        slug: String(data.slug ?? ""),
        columns: Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : [...DEFAULT_COLUMNS],
        planTier: String(data.planTier ?? "free"),
        slugEditable: Boolean(data.slugEditable),
        generatedSlug: String(data.generatedSlug ?? ""),
        suggestedSlugFromName: String(data.suggestedSlugFromName ?? ""),
      });
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Public Inventory settings.");
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    if (!signedIn || !window.desktop?.inventory?.list) return;
    try {
      const payload = await window.desktop.inventory.list({ baseUrl, status: "Available" });
      const rows = Array.isArray(payload.inventoryItems) ? payload.inventoryItems : [];
      setPreviewItems(rows.slice(0, 8));
    } catch {
      setPreviewItems([]);
    }
  };

  useEffect(() => {
    void loadSettings();
    void loadPreview();
  }, [baseUrl, signedIn]);

  const toggleColumn = (columnKey: string) => {
    setSettings((prev) => {
      const nextColumns = prev.columns.includes(columnKey)
        ? prev.columns.filter((entry) => entry !== columnKey)
        : [...prev.columns, columnKey];
      return { ...prev, columns: nextColumns };
    });
  };

  const handleSave = async () => {
    if (!window.desktop?.publicInventory?.saveSettings) return;

    const slug = String(settings.slug ?? "").trim();
    if (settings.enabled && settings.slugEditable && !slug) {
      setError("Slug is required when Public Inventory is enabled.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const payload = await window.desktop.publicInventory.saveSettings({
        baseUrl,
        data: {
          enabled: Boolean(settings.enabled),
          slug,
          columns: settings.columns,
        },
      });

      setSettings((prev) => ({
        ...prev,
        enabled: Boolean(payload.enabled),
        slug: String(payload.slug ?? prev.slug),
        columns: Array.isArray(payload.columns) ? payload.columns : prev.columns,
        planTier: String(payload.planTier ?? prev.planTier ?? "free"),
        slugEditable: Boolean(payload.slugEditable ?? prev.slugEditable),
        generatedSlug: String(payload.generatedSlug ?? prev.generatedSlug ?? ""),
        suggestedSlugFromName: String(payload.suggestedSlugFromName ?? prev.suggestedSlugFromName ?? ""),
      }));
      setStatus("Public Inventory settings saved.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Public Inventory settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setStatus("Public URL copied.");
    } catch {
      setStatus("Failed to copy URL.");
    }
  };

  const handleOpenUrl = async () => {
    if (!publicUrl || !window.desktop?.openExternal) return;
    try {
      await window.desktop.openExternal(publicUrl);
    } catch {
      setStatus("Failed to open public URL.");
    }
  };

  if (loading) {
    return (
      <div className="public-inventory-shell">
        <p className="hint">Loading Public Inventory settings...</p>
      </div>
    );
  }

  return (
    <div className="public-inventory-shell">
      <section className="public-inventory-toolbar">
        <div>
          <h2>Public Inventory</h2>
          <p>Control what customers can see in your shared inventory page.</p>
        </div>
        <div className="public-inventory-toolbar__actions">
          <button type="button" onClick={() => void loadSettings()} disabled={loading || saving}>Refresh</button>
          <button type="button" onClick={() => void handleSave()} disabled={loading || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>

      <section className="public-inventory-grid">
        <article className="public-inventory-card">
          <h3>Settings</h3>

          <label className="public-inventory-toggle">
            <input
              type="checkbox"
              checked={Boolean(settings.enabled)}
              onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
              disabled={loading || saving}
            />
            <span>Enable Public Inventory</span>
          </label>

          <label>
            Public Slug
            <input
              value={settings.slug}
              onChange={(event) => setSettings((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="your-company"
              disabled={loading || saving || !settings.slugEditable}
            />
          </label>

          {!settings.slugEditable && settings.generatedSlug ? (
            <p className="hint">Current plan uses auto-generated slug: {settings.generatedSlug}</p>
          ) : null}

          <p className="hint">Plan Tier: {settings.planTier ?? "free"}</p>

          <div className="public-inventory-url-row">
            <input value={publicUrl} readOnly placeholder="Public URL will appear here" />
            <button type="button" onClick={() => void handleCopyUrl()} disabled={!publicUrl}>Copy</button>
            <button type="button" onClick={() => void handleOpenUrl()} disabled={!publicUrl}>Open</button>
          </div>
        </article>

        <article className="public-inventory-card">
          <h3>Visible Columns</h3>
          <div className="public-inventory-columns">
            {AVAILABLE_COLUMNS.map((column) => (
              <label key={column.key} className="public-inventory-column-item">
                <input
                  type="checkbox"
                  checked={settings.columns.includes(column.key)}
                  onChange={() => toggleColumn(column.key)}
                  disabled={loading || saving}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </article>
      </section>

      <section className="public-inventory-card">
        <h3>Preview (Available Inventory)</h3>
        <div className="public-inventory-preview-wrap">
          <table className="public-inventory-preview-table">
            <thead>
              <tr>
                {previewColumns.map((column) => (
                  <th key={column}>{AVAILABLE_COLUMNS.find((entry) => entry.key === column)?.label ?? column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewItems.map((item) => (
                <tr key={item.id}>
                  {previewColumns.map((column) => (
                    <td key={`${item.id}-${column}`}>{getCellValue(item, column)}</td>
                  ))}
                </tr>
              ))}
              {previewItems.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, previewColumns.length)}>No available inventory to preview.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
