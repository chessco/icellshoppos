"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";
import {
  defaultModelCatalog,
  fetchModelCatalog,
  saveModelCatalogRemote,
  type ModelCatalog,
} from "@/lib/modelCatalog";
import {
  DEFAULT_RECEIPT_CONFIG,
  MAX_RECEIPT_CUSTOM_LINES,
  type ReceiptConfig,
  type ReceiptCustomLine,
} from "@/lib/receipt-config";
import {
  buildSaleReceiptDocument,
  printSaleReceipt,
  type ReceiptPrintLayout,
  type SaleReceiptData,
} from "@/lib/sales-receipt";
import {
  defaultConditionOptions,
  defaultGradeOptions,
  fetchConditionOptions,
  fetchGradeOptions,
  saveConditionOptions,
  saveGradeOptions,
} from "@/lib/sheets";
import {
  defaultCarrierOptions,
  fetchCarrierOptions,
  saveCarrierOptions,
} from "@/lib/carrier-options";

//  Types 

type Supplier = {
  id: string;
  name: string;
  status: string;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  customerType: "retail" | "wholesale";
  defaultPriceTier: string;
  status: string;
  creditEnabled: boolean;
};

type ExchangeRate = {
  id: string;
  usdToMxn: string;
  createdAt: string;
};

type Location = {
  id: string;
  name: string;
  status: string;
};

type PricingRule = {
  id: string;
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
};

type DraftRow = {
  model: string;
  capacity: string;
  price: string;
  price2: string;
  price3: string;
  id?: string;
};

type CatalogDraft = {
  capacities: string;
  colors: string;
  deviceTypeId: string;
};

type CsvRow = Record<string, string>;

type Tab = "suppliers" | "customers" | "locations" | "pricing" | "device-guide" | "grading" | "dio" | "exchange-rate" | "integrations" | "receipt";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function DataAdminPage() {
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("suppliers");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar pathname={pathname} />
      <main className="flex min-w-0 flex-1 flex-col gap-0">
        <div className="border-b border-[#d6e4ff] bg-white px-6 py-4">
          <h1 className="text-xl font-bold text-[#0f1f3d]">Data Admin</h1>
          <p className="text-sm text-[#5f7298]">Manage suppliers, customers, locations, pricing, device guide, grading, carriers, DIO reminders, exchange rates, integrations, and receipt content.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/data/repairs"
              className="inline-flex rounded-xl border border-[#cfe0ff] bg-[#eff5ff] px-3 py-2 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#dce8ff]"
            >
              Repair Data (Failures, Catalog, Customers, Parts Suppliers)
            </Link>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[#d6e4ff] bg-white px-6">
          {(["suppliers", "customers", "locations", "pricing", "device-guide", "grading", "dio", "exchange-rate", "integrations", "receipt"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-3 text-sm font-medium capitalize transition border-b-2",
                tab === t
                  ? "border-[#2563eb] text-[#2563eb]"
                  : "border-transparent text-[#5f7298] hover:text-[#1f3563]",
              ].join(" ")}
            >
              {t === "exchange-rate"
                ? "Exchange Rate"
                : t === "integrations"
                ? "Integrations"
                : t === "receipt"
                ? "Receipt"
                : t === "device-guide"
                ? "Device Guide"
                : t === "grading"
                ? "Grading"
                : t === "dio"
                ? "DIO"
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-[#f4f8ff] px-6 py-6">
          {tab === "suppliers" && <SuppliersTab />}
          {tab === "customers" && <CustomersTab />}
          {tab === "locations" && <LocationsTab />}
          {tab === "pricing" && <PricingTab />}
          {tab === "device-guide" && <DeviceGuideTab />}
          {tab === "grading" && <GradingTab />}
          {tab === "dio" && <DIORemindersTab />}
          {tab === "exchange-rate" && <ExchangeRateTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "receipt" && <ReceiptTab />}
        </div>
      </main>
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suppliers");
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add supplier."); return; }
      setSuccess(`Supplier "${draft.trim()}" added.`);
      setDraft("");
      load();
    } catch {
      setError("Failed to add supplier.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setEditName(supplier.name);
    setError(""); setSuccess("");
  };

  const handleUpdate = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/suppliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName.trim() }),
      });
      if (!res.ok) { setError("Failed to update supplier."); return; }
      setSuccess("Supplier updated.");
      setEditingId(null);
      load();
    } catch {
      setError("Failed to update supplier.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (supplier: Supplier) => {
    const newStatus = supplier.status === "Active" ? "Inactive" : "Active";
    try {
      await fetch("/api/suppliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: supplier.id, status: newStatus }),
      });
      load();
    } catch {
      setError("Failed to update supplier.");
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Delete supplier "${supplier.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/suppliers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: supplier.id }),
      });
      if (!res.ok) { setError("Failed to delete supplier."); return; }
      setSuccess(`Supplier "${supplier.name}" deleted.`);
      load();
    } catch {
      setError("Failed to delete supplier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title="Add Supplier">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Supplier name"
            className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </form>
        {error && <Msg type="error">{error}</Msg>}
        {success && <Msg type="success">{success}</Msg>}
      </Card>

      {editingId && (
        <Card title="Edit Supplier">
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Supplier name"
              className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`Suppliers (${suppliers.length})`}>
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No suppliers yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex-1 text-sm font-medium text-[#0f1f3d]">{s.name}</span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => toggleStatus(s)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      s.status === "Active"
                        ? "bg-[#eef5ff] text-[#2563eb] hover:bg-[#d6e8ff]"
                        : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]",
                    ].join(" ")}
                  >
                    {s.status === "Active" ? "🔴" : "⚪"} {s.status}
                  </button>
                  <button
                    onClick={() => startEdit(s)}
                    disabled={saving}
                    className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={saving}
                    className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const PRICE_TIERS = ["Price", "Price 2", "Price 3"];
const CUSTOMER_TYPES: Array<{ value: "retail" | "wholesale"; label: string }> = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
];
const AREA_CODES = [
  { code: "+1", label: "USA (+1)" },
  { code: "+52", label: "Mexico (+52)" },
];

function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManageCredit, setCanManageCredit] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areaCode, setAreaCode] = useState("+1");
  const [whatsapp, setWhatsapp] = useState("");
  const [customerType, setCustomerType] = useState<"retail" | "wholesale">("retail");
  const [tier, setTier] = useState("Price");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAreaCode, setEditAreaCode] = useState("+1");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editCustomerType, setEditCustomerType] = useState<"retail" | "wholesale">("retail");
  const [editTier, setEditTier] = useState("Price");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customersRes, meRes] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const data = await customersRes.json();
      setCustomers(data.customers ?? []);
      if (meRes.ok) {
        const me = await meRes.json();
        setCanManageCredit(
          Boolean(me?.permissions?.canManageOrgSettings) || Boolean(me?.session?.isSuperadmin)
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !whatsapp.trim()) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: `${areaCode}${whatsapp.trim()}`,
          customerType,
          defaultPriceTier: tier,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add customer."); return; }
      setSuccess(`Customer "${name.trim()}" added.`);
      setName(""); setEmail(""); setAreaCode("+1"); setWhatsapp(""); setCustomerType("retail"); setTier("Price");
      load();
    } catch {
      setError("Failed to add customer.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditEmail(c.email || "");
    // Parse area code from whatsapp
    const whatsappStr = c.whatsapp || "";
    let parsedAreaCode = "+1";
    let parsedNumber = whatsappStr;
    if (whatsappStr.startsWith("+52")) {
      parsedAreaCode = "+52";
      parsedNumber = whatsappStr.slice(3);
    } else if (whatsappStr.startsWith("+1")) {
      parsedAreaCode = "+1";
      parsedNumber = whatsappStr.slice(2);
    }
    setEditAreaCode(parsedAreaCode);
    setEditWhatsapp(parsedNumber);
    setEditCustomerType(c.customerType ?? "retail");
    setEditTier(c.defaultPriceTier);
    setError(""); setSuccess("");
  };

  const handleUpdate = async () => {
    if (!editName.trim() || !editEmail.trim() || !editWhatsapp.trim()) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editName.trim(),
          email: editEmail.trim(),
          whatsapp: `${editAreaCode}${editWhatsapp.trim()}`,
          customerType: editCustomerType,
          defaultPriceTier: editTier,
        }),
      });
      if (!res.ok) { setError("Failed to update customer."); return; }
      setSuccess("Customer updated.");
      setEditingId(null);
      load();
    } catch {
      setError("Failed to update customer.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c: Customer) => {
    const newStatus = c.status === "Active" ? "Inactive" : "Active";
    try {
      await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: c.id,
          name: c.name,
          email: c.email,
          whatsapp: c.whatsapp,
          customerType: c.customerType,
          defaultPriceTier: c.defaultPriceTier,
          status: newStatus,
          creditEnabled: c.creditEnabled,
        }),
      });
      load();
    } catch {
      setError("Failed to update customer.");
    }
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      if (!res.ok) { setError("Failed to delete customer."); return; }
      setSuccess(`Customer "${c.name}" deleted.`);
      load();
    } catch {
      setError("Failed to delete customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title="Add Customer">
        <form onSubmit={handleAdd} className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name *"
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              required
            />
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as "retail" | "wholesale")}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            >
              {CUSTOMER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            >
              {PRICE_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email *"
            className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            required
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            >
              {AREA_CODES.map((ac) => <option key={ac.code} value={ac.code}>{ac.label}</option>)}
            </select>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10 digits *"
              maxLength={10}
              className="col-span-2 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              required
            />
          </div>
          {error && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add Customer"}
          </button>
        </form>
      </Card>

      {editingId && (
        <Card title="Edit Customer">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name *"
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                required
              />
              <select
                value={editCustomerType}
                onChange={(e) => setEditCustomerType(e.target.value as "retail" | "wholesale")}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              >
                {CUSTOMER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <select
                value={editTier}
                onChange={(e) => setEditTier(e.target.value)}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              >
                {PRICE_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Email *"
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              required
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={editAreaCode}
                onChange={(e) => setEditAreaCode(e.target.value)}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              >
                {AREA_CODES.map((ac) => <option key={ac.code} value={ac.code}>{ac.label}</option>)}
              </select>
              <input
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 digits *"
                maxLength={10}
                className="col-span-2 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`Customers (${customers.length})`}>
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No customers yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#0f1f3d]">{c.name}</p>
                  <p className="truncate text-xs text-[#5f7298]">
                    {(c.customerType === "wholesale" ? "Wholesale" : "Retail") + " · " + c.defaultPriceTier}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.whatsapp ? ` · ${c.whatsapp}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => toggleStatus(c)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      c.status === "Active"
                        ? "bg-[#eef5ff] text-[#2563eb] hover:bg-[#d6e8ff]"
                        : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]",
                    ].join(" ")}
                  >
                    {c.status === "Active" ? "🔴" : "⚪"} {c.status}
                  </button>
                  {canManageCredit && (
                    <button
                      onClick={async () => {
                        try {
                          await fetch("/api/customers", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: c.id,
                              name: c.name,
                              email: c.email,
                              whatsapp: c.whatsapp,
                              customerType: c.customerType,
                              defaultPriceTier: c.defaultPriceTier,
                              status: c.status,
                              creditEnabled: !c.creditEnabled,
                            }),
                          });
                          load();
                        } catch {
                          setError("Failed to update credit setting.");
                        }
                      }}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold transition",
                        c.creditEnabled
                          ? "bg-[#fff3d9] text-[#7a4e0e] hover:bg-[#ffe6a0]"
                          : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]",
                      ].join(" ")}
                      title={c.creditEnabled ? "Disable credit for this customer" : "Enable credit for this customer"}
                    >
                      {c.creditEnabled ? "💳 Credit" : "💳 No Credit"}
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(c)}
                    disabled={saving}
                    className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={saving}
                    className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      setLocations(data.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add location.");
        return;
      }
      setSuccess(`Location "${draft.trim()}" added.`);
      setDraft("");
      load();
    } catch {
      setError("Failed to add location.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (location: Location) => {
    setEditingId(location.id);
    setEditName(location.name);
    setError("");
    setSuccess("");
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update location.");
        return;
      }
      setSuccess("Location updated.");
      setEditingId(null);
      load();
    } catch {
      setError("Failed to update location.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (location: Location) => {
    const nextStatus = location.status === "Active" ? "Inactive" : "Active";
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: location.id, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update location.");
        return;
      }
      setSuccess("Location updated.");
      load();
    } catch {
      setError("Failed to update location.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (location: Location) => {
    if (!confirm(`Delete location "${location.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/locations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: location.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete location.");
        return;
      }
      setSuccess(`Location "${location.name}" deleted.`);
      load();
    } catch {
      setError("Failed to delete location.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title="Add Location">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Location name"
            className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </form>
        {error && <Msg type="error">{error}</Msg>}
        {success && <Msg type="success">{success}</Msg>}
      </Card>

      {editingId && (
        <Card title="Edit Location">
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Location name"
              className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`Locations (${locations.length})`}>
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : locations.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No locations yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {locations.map((location) => (
              <li key={location.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex-1 text-sm font-medium text-[#0f1f3d]">{location.name}</span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => toggleStatus(location)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      location.status === "Active"
                        ? "bg-[#eef5ff] text-[#2563eb] hover:bg-[#d6e8ff]"
                        : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]",
                    ].join(" ")}
                  >
                    {location.status === "Active" ? "🔴" : "⚪"} {location.status}
                  </button>
                  <button
                    onClick={() => startEdit(location)}
                    disabled={saving}
                    className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(location)}
                    disabled={saving}
                    className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const parseAmount = (value: string) => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
};

const toMoneyWhole = (value: string) => {
  const parsed = parseAmount(value);
  if (parsed === null) return "";
  return String(Math.round(parsed));
};

const displayMoney = (value: string) => {
  const parsed = parseAmount(value);
  if (parsed === null) return "";
  return formatCurrencyDisplay(Math.round(parsed));
};

const modelOrder = Object.keys(defaultModelCatalog);

const parseGeneration = (model: string) => {
  const match = model.match(/iphone\s+(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const variantRank = (model: string) => {
  const lower = model.toLowerCase();
  if (lower.includes("mini")) return 1;
  if (lower.includes("plus")) return 2;
  if (lower.includes("pro max")) return 4;
  if (lower.includes("pro")) return 3;
  if (lower.includes("air")) return 5;
  return 0;
};

const capacityToGb = (capacity: string) => {
  const match = capacity.trim().toLowerCase().match(/(\d+)\s*(gb|tb)/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return match[2] === "tb" ? value * 1024 : value;
};

function PricingTab() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog>(defaultModelCatalog);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csvEscape = (value: string) => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const content = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return { headers: [] as string[], rows: [] as CsvRow[] };
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });

    return { headers, rows };
  };

  const readFileText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const handleUploadPricing = async (file: File | null) => {
    if (!file) return;

    try {
      setBusy(true);
      setStatus("Uploading pricing CSV...");

      const text = await readFileText(file);
      const { headers, rows } = parseCsv(text);

      if (headers.length === 0 || rows.length === 0) {
        setStatus("No pricing rows found in CSV.");
        return;
      }

      const headerMap = new Map(headers.map((header) => [normalizeHeader(header), header]));
      const modelKey = headerMap.get("model") ?? "model";
      const capacityKey = headerMap.get("capacity") ?? "capacity";
      const priceKey = headerMap.get("price") ?? "price";
      const price2Key = headerMap.get("price2") ?? "price 2";
      const price3Key = headerMap.get("price3") ?? "price 3";

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        const model = String(row[modelKey] ?? "").trim();
        const capacity = String(row[capacityKey] ?? "").trim();
        const price = toMoneyWhole(String(row[priceKey] ?? ""));
        const price2 = toMoneyWhole(String(row[price2Key] ?? ""));
        const price3 = toMoneyWhole(String(row[price3Key] ?? ""));

        if (!model || !capacity || !price || !price2 || !price3) {
          skippedCount += 1;
          continue;
        }

        const response = await fetch("/api/pricing-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, capacity, price, price2, price3 }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setStatus(typeof payload?.error === "string" ? payload.error : "Failed to import pricing CSV.");
          return;
        }

        importedCount += 1;
      }

      await loadRules();
      setStatus(`Imported ${importedCount} pricing rows.${skippedCount > 0 ? ` Skipped ${skippedCount} invalid rows.` : ""}`);
    } catch {
      setStatus("Failed to import pricing CSV.");
    } finally {
      setBusy(false);
    }
  };

  const loadRules = async () => {
    try {
      setBusy(true);
      const res = await fetch("/api/pricing-rules");
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Failed to load pricing rules.");
        return;
      }
      setRules(data.rules ?? []);
      setStatus(null);
    } catch {
      setStatus("Failed to load pricing rules.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    void (async () => {
      const loadedCatalog = await fetchModelCatalog();
      setCatalog(loadedCatalog);
    })();
  }, []);

  const allRows = useMemo(() => {
    const map = new Map<string, DraftRow>();

    Object.entries(catalog).forEach(([model, entry]) => {
      entry.capacities.forEach((capacity) => {
        const key = `${model}||${capacity}`;
        map.set(key, { model, capacity, price: "", price2: "", price3: "" });
      });
    });

    rules.forEach((rule) => {
      const key = `${rule.model}||${rule.capacity}`;
      map.set(key, {
        id: rule.id,
        model: rule.model,
        capacity: rule.capacity,
        price: rule.price,
        price2: rule.price2,
        price3: rule.price3,
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const aKnownIndex = modelOrder.indexOf(a.model);
      const bKnownIndex = modelOrder.indexOf(b.model);

      if (aKnownIndex !== -1 || bKnownIndex !== -1) {
        if (aKnownIndex === -1) return 1;
        if (bKnownIndex === -1) return -1;
        if (aKnownIndex !== bKnownIndex) return aKnownIndex - bKnownIndex;
      }

      const byGeneration = parseGeneration(a.model) - parseGeneration(b.model);
      if (byGeneration !== 0) return byGeneration;

      const byVariant = variantRank(a.model) - variantRank(b.model);
      if (byVariant !== 0) return byVariant;

      const byModelName = a.model.localeCompare(b.model);
      if (byModelName !== 0) return byModelName;

      const byCapacitySize = capacityToGb(a.capacity) - capacityToGb(b.capacity);
      if (byCapacitySize !== 0) return byCapacitySize;

      return a.capacity.localeCompare(b.capacity);
    });
  }, [catalog, rules]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allRows;
    return allRows.filter(
      (row) => row.model.toLowerCase().includes(query) || row.capacity.toLowerCase().includes(query)
    );
  }, [allRows, search]);

  const getDraft = (row: DraftRow) => drafts[`${row.model}||${row.capacity}`] ?? row;

  const setDraftField = (row: DraftRow, field: "price" | "price2" | "price3", value: string) => {
    const key = `${row.model}||${row.capacity}`;
    setDrafts((prev) => {
      const current = prev[key] ?? row;
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const saveRow = async (row: DraftRow) => {
    const key = `${row.model}||${row.capacity}`;
    const draft = drafts[key] ?? row;

    const payload = {
      model: draft.model,
      capacity: draft.capacity,
      price: toMoneyWhole(draft.price),
      price2: toMoneyWhole(draft.price2),
      price3: toMoneyWhole(draft.price3),
    };

    if (!payload.price || !payload.price2 || !payload.price3) {
      setStatus(`All prices are required for ${draft.model} ${draft.capacity}.`);
      return;
    }

    try {
      setBusy(true);
      const res = await fetch("/api/pricing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Failed to save pricing rule.");
        return;
      }
      setStatus(`Saved ${draft.model} ${draft.capacity}.`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadRules();
    } catch {
      setStatus("Failed to save pricing rule.");
    } finally {
      setBusy(false);
    }
  };

  const saveAllDrafts = async () => {
    const draftEntries = Object.entries(drafts);
    if (draftEntries.length === 0) {
      setStatus("No pricing changes to save.");
      return;
    }

    setBusy(true);
    try {
      for (const [, draft] of draftEntries) {
        const payload = {
          model: draft.model,
          capacity: draft.capacity,
          price: toMoneyWhole(draft.price),
          price2: toMoneyWhole(draft.price2),
          price3: toMoneyWhole(draft.price3),
        };

        if (!payload.price || !payload.price2 || !payload.price3) {
          setStatus(`All prices are required for ${draft.model} ${draft.capacity}.`);
          return;
        }

        const res = await fetch("/api/pricing-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          setStatus(data.error ?? `Failed to save ${draft.model} ${draft.capacity}.`);
          return;
        }
      }

      setDrafts({});
      await loadRules();
      setStatus(`Saved ${draftEntries.length} pricing row(s).`);
    } catch {
      setStatus("Failed to save pricing rules.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card title="Pricing Rules">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search model or capacity"
            className="w-full max-w-sm rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
          <button
            type="button"
            onClick={loadRules}
            disabled={busy}
            className="rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-medium text-[#2563eb] disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              const rows: string[][] = [["Model", "Capacity", "Price", "Price 2", "Price 3"]];
              allRows.forEach((row) => {
                rows.push([
                  row.model,
                  row.capacity,
                  row.price || "",
                  row.price2 || "",
                  row.price3 || "",
                ]);
              });
              downloadCsv("pricing-template.csv", rows);
            }}
            disabled={busy}
            className="rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-medium text-[#2563eb] disabled:opacity-60"
          >
            Download Pricing Template
          </button>
          <label className="rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-medium text-[#2563eb] disabled:opacity-60 cursor-pointer">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? []);
                void handleUploadPricing(file ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={saveAllDrafts}
            disabled={busy}
            className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </Card>

      <Card title="Pricing Table">
        <div className="mobile-scroll max-h-[70vh] overflow-auto">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#eef4ff] text-[#5f7298]">
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Capacity</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Price 2</th>
                <th className="px-3 py-2">Price 3</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const draft = getDraft(row);
                return (
                  <tr key={`${row.model}||${row.capacity}`} className="border-b border-[#eef4ff]">
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-[#0f1f3d]">{row.model}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.capacity}</td>
                    <td className="px-3 py-2">
                      <input
                        value={displayMoney(draft.price)}
                        onChange={(event) => setDraftField(row, "price", event.target.value)}
                        className="w-28 rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                        placeholder="$0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={displayMoney(draft.price2)}
                        onChange={(event) => setDraftField(row, "price2", event.target.value)}
                        className="w-28 rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                        placeholder="$0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={displayMoney(draft.price3)}
                        onChange={(event) => setDraftField(row, "price3", event.target.value)}
                        className="w-28 rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                        placeholder="$0"
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[#5f7298]">
                    No rows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {status && <Msg type="success">{status}</Msg>}
      </Card>
    </div>
  );
}

function DeviceGuideTab() {
  const [catalog, setCatalog] = useState<ModelCatalog>({});
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, CatalogDraft>>({});
  const [newModel, setNewModel] = useState("");
  const [newCapacities, setNewCapacities] = useState("");
  const [newColors, setNewColors] = useState("");
  const [newModelTypeId, setNewModelTypeId] = useState("");
  const [guideStatus, setGuideStatus] = useState<string | null>(null);
  const [deviceTypes, setDeviceTypes] = useState<{ id: string; name: string; description?: string }[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");
  const [typeStatus, setTypeStatus] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypeDesc, setEditTypeDesc] = useState("");

  const normalizeList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const csvEscape = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map((value) => value.trim());
  };

  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return { headers: [] as string[], rows: [] as CsvRow[] };
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
    return { headers, rows };
  };

  const readFileText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const downloadCsv = (filename: string, rows: string[][]) => {
    const content = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  useEffect(() => {
    void (async () => {
      const loadedCatalog = await fetchModelCatalog();
      setCatalog(loadedCatalog);
      const nextDrafts: Record<string, CatalogDraft> = {};
      Object.entries(loadedCatalog).forEach(([model, entry]) => {
        nextDrafts[model] = {
          capacities: entry.capacities.join(", "),
          colors: entry.colors.join(", "),
          deviceTypeId: entry.deviceTypeId || "",
        };
      });
      setCatalogDrafts(nextDrafts);
    })();
  }, []);

  const fetchDeviceTypes = async () => {
    try {
      const res = await fetch("/api/device-types");
      const data = await res.json();
      setDeviceTypes(data.deviceTypes ?? []);
    } catch { /* ignore */ }
  };

  useEffect(() => { void fetchDeviceTypes(); }, []);

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const res = await fetch("/api/device-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTypeName.trim(), description: newTypeDesc.trim() || null }),
      });
      if (!res.ok) { const d = await res.json(); setTypeStatus(d.error || "Failed"); return; }
      setNewTypeName(""); setNewTypeDesc("");
      setTypeStatus("Device type added.");
      await fetchDeviceTypes();
    } catch { setTypeStatus("Failed to add device type."); }
  };

  const handleEditType = (type: { id: string; name: string; description?: string }) => {
    setEditingType(type.id);
    setEditTypeName(type.name);
    setEditTypeDesc(type.description ?? "");
  };

  const handleSaveEditType = async () => {
    if (!editingType || !editTypeName.trim()) return;
    try {
      const res = await fetch(`/api/device-types/${editingType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editTypeName.trim(), description: editTypeDesc.trim() || null }),
      });
      if (!res.ok) { const d = await res.json(); setTypeStatus(d.error || "Failed"); return; }
      setEditingType(null);
      setTypeStatus("Device type updated.");
      await fetchDeviceTypes();
    } catch { setTypeStatus("Failed to update device type."); }
  };

  const handleDeleteType = async (id: string) => {
    try {
      await fetch(`/api/device-types/${id}`, { method: "DELETE" });
      setTypeStatus("Device type deleted.");
      await fetchDeviceTypes();
    } catch { setTypeStatus("Failed to delete device type."); }
  };

  const handleSaveCatalog = async () => {
    const nextCatalog: ModelCatalog = {};
    Object.entries(catalogDrafts).forEach(([model, draft]) => {
      const cleanModel = model.trim();
      if (!cleanModel) return;
      const capacities = normalizeList(draft.capacities);
      const colors = normalizeList(draft.colors);
      if (capacities.length === 0 || colors.length === 0) return;
      nextCatalog[cleanModel] = { capacities, colors, ...(draft.deviceTypeId ? { deviceTypeId: draft.deviceTypeId } : {}) };
    });

    if (Object.keys(nextCatalog).length === 0) {
      setGuideStatus("Device guide must include at least one model.");
      return;
    }

    try {
      const persisted = await saveModelCatalogRemote(nextCatalog);
      setCatalog(persisted);
      setGuideStatus("Device guide saved.");
    } catch (error: unknown) {
      setGuideStatus(error instanceof Error ? error.message : "Failed to save device guide.");
    }
  };

  const deviceTypeNameById = (id: string) => deviceTypes.find((t) => t.id === id)?.name || "";

  const handleDownloadGuide = () => {
    const rows: string[][] = [["Title", "Storage", "Color", "Type"]];
    Object.entries(catalog).forEach(([model, entry]) => {
      rows.push([model, entry.capacities.join(", "), entry.colors.join(", "), deviceTypeNameById(entry.deviceTypeId || "")]);
    });
    if (rows.length === 1) {
      rows.push(["iPhone 11", "64GB, 256GB, 512GB", "Purple, Yellow, Green, Black, White, Red", "Phone"]);
    }
    downloadCsv("device-guide-template.csv", rows);
  };

  const handleUploadGuide = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const { rows } = parseCsv(text);
      const nextCatalog: ModelCatalog = {};
      rows.forEach((row) => {
        const model = row.title || row.model || row.device || "";
        const storage = row.storage || row.capacity || row.capacities || "";
        const colors = row.color || row.colors || "";
        const typeName = row.type || "";
        if (!model.trim()) return;
        const capacities = normalizeList(storage);
        const colorList = normalizeList(colors);
        if (capacities.length === 0 || colorList.length === 0) return;
        const matchedType = typeName.trim() ? deviceTypes.find((t) => t.name.toLowerCase() === typeName.trim().toLowerCase()) : undefined;
        nextCatalog[model.trim()] = { capacities, colors: colorList, ...(matchedType ? { deviceTypeId: matchedType.id } : {}) };
      });

      if (Object.keys(nextCatalog).length === 0) {
        setGuideStatus("No valid device guide rows found.");
        return;
      }

      setCatalogDrafts(() => {
        const drafts: Record<string, CatalogDraft> = {};
        Object.entries(nextCatalog).forEach(([model, entry]) => {
          drafts[model] = {
            capacities: entry.capacities.join(", "),
            colors: entry.colors.join(", "),
            deviceTypeId: entry.deviceTypeId || "",
          };
        });
        return drafts;
      });
      const persisted = await saveModelCatalogRemote(nextCatalog);
      setCatalog(persisted);
      setGuideStatus("CSV imported successfully.");
    } catch (error: unknown) {
      setGuideStatus(error instanceof Error ? error.message : "Failed to import device guide.");
    }
  };

  const handleAddModel = () => {
    const model = newModel.trim();
    if (!model) {
      setGuideStatus("Enter a model name.");
      return;
    }
    setCatalogDrafts((prev) => ({
      ...prev,
      [model]: {
        capacities: newCapacities.trim(),
        colors: newColors.trim(),
        deviceTypeId: newModelTypeId,
      },
    }));
    setNewModel("");
    setNewCapacities("");
    setNewColors("");
    setNewModelTypeId("");
    setGuideStatus(null);
  };

  const handleRemoveModel = (model: string) => {
    setCatalogDrafts((prev) => {
      const next = { ...prev };
      delete next[model];
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card title="Device Types">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              placeholder="Type name (e.g. Phone)"
            />
            <input
              value={newTypeDesc}
              onChange={e => setNewTypeDesc(e.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              placeholder="Description (optional)"
            />
            <button
              className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => void handleAddType()}
              type="button"
            >
              Add Type
            </button>
          </div>
          {typeStatus && <Msg type="success">{typeStatus}</Msg>}
          <div className="overflow-x-auto">
            <table className="min-w-[480px] text-left text-sm">
              <thead className="bg-white">
                <tr className="border-b border-[#eef4ff] text-[#5f7298]">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deviceTypes.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-[#5f7298]">No device types.</td></tr>
                )}
                {deviceTypes.map((type) => (
                  <tr key={type.id} className="border-b border-[#eef4ff]">
                    <td className="px-3 py-2">
                      {editingType === type.id ? (
                        <input value={editTypeName} onChange={e => setEditTypeName(e.target.value)} className="rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]" />
                      ) : type.name}
                    </td>
                    <td className="px-3 py-2">
                      {editingType === type.id ? (
                        <input value={editTypeDesc} onChange={e => setEditTypeDesc(e.target.value)} className="rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]" />
                      ) : (type.description || "—")}
                    </td>
                    <td className="px-3 py-2 space-x-2">
                      {editingType === type.id ? (
                        <>
                          <button className="text-[#2563eb] font-semibold" onClick={() => void handleSaveEditType()} type="button">Save</button>
                          <button className="text-[#5f7298]" onClick={() => setEditingType(null)} type="button">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="text-[#2563eb] font-semibold" onClick={() => handleEditType(type)} type="button">Edit</button>
                          <button className="text-[#ff6b6b] font-semibold" onClick={() => void handleDeleteType(type.id)} type="button">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title="Device Guide Controls">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#5f7298]">Edit device guide in a table view. Only the table scrolls.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-semibold text-[#2563eb]"
              onClick={handleDownloadGuide}
              type="button"
            >
              Download CSV
            </button>
            <label className="cursor-pointer rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-semibold text-[#2563eb]">
              Upload CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => handleUploadGuide(event.target.files?.[0] || null)}
              />
            </label>
            <button
              className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                void handleSaveCatalog();
              }}
              type="button"
            >
              Save Guide
            </button>
          </div>
        </div>
        {guideStatus && <Msg type="success">{guideStatus}</Msg>}
      </Card>

      <Card title="Add Model Row">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
          <input
            value={newModel}
            onChange={(event) => setNewModel(event.target.value)}
            className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            placeholder="Model"
          />
          <input
            value={newCapacities}
            onChange={(event) => setNewCapacities(event.target.value)}
            className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            placeholder="Storage (comma-separated)"
          />
          <input
            value={newColors}
            onChange={(event) => setNewColors(event.target.value)}
            className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            placeholder="Colors (comma-separated)"
          />
          <select
            value={newModelTypeId}
            onChange={(event) => setNewModelTypeId(event.target.value)}
            className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          >
            <option value="">Type (optional)</option>
            {deviceTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>{dt.name}</option>
            ))}
          </select>
          <button
            className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white"
            onClick={handleAddModel}
            type="button"
          >
            Add
          </button>
        </div>
      </Card>

      <Card title="Device Guide Table">
        <div className="mobile-scroll max-h-[70vh] overflow-auto">
          <table className="min-w-[860px] text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#eef4ff] text-[#5f7298]">
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Storage</th>
                <th className="px-3 py-2">Colors</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(catalogDrafts).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[#5f7298]">
                    No models configured.
                  </td>
                </tr>
              )}
              {Object.entries(catalogDrafts).map(([model, entry]) => (
                <tr key={model} className="border-b border-[#eef4ff]">
                  <td className="px-3 py-2 font-medium text-[#0f1f3d]">{model}</td>
                  <td className="px-3 py-2">
                    <select
                      value={entry.deviceTypeId}
                      onChange={(event) =>
                        setCatalogDrafts((prev) => ({
                          ...prev,
                          [model]: { ...prev[model], deviceTypeId: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                    >
                      <option value="">—</option>
                      {deviceTypes.map((dt) => (
                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={entry.capacities}
                      onChange={(event) =>
                        setCatalogDrafts((prev) => ({
                          ...prev,
                          [model]: { ...prev[model], capacities: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                      placeholder="Storage (comma-separated)"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={entry.colors}
                      onChange={(event) =>
                        setCatalogDrafts((prev) => ({
                          ...prev,
                          [model]: { ...prev[model], colors: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#bfd4ff] bg-[#f7fbff] px-2 py-1 outline-none focus:border-[#2563eb]"
                      placeholder="Colors (comma-separated)"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b]"
                      onClick={() => handleRemoveModel(model)}
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ExchangeRateTab() {
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const [latest, setLatest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exchange-rates");
      const data = await res.json();
      setLatest(data.latestRate ?? null);
      setHistory(data.history ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const num = parseFloat(draft);
    if (!isFinite(num) || num <= 0) { setError("Enter a valid positive rate."); return; }
    setSaving(true);
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdToMxn: num }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save rate."); return; }
      setSuccess(`Rate ${num} saved.`);
      setDraft("");
      load();
    } catch {
      setError("Failed to save rate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {latest && (
        <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5">
          <p className="text-sm text-[#5f7298]">Current Rate</p>
          <p className="mt-1 text-3xl font-bold text-[#0f1f3d]">
            <span className="text-[#2563eb]">{parseFloat(latest).toFixed(2)}</span>
          </p>
        </div>
      )}

      <Card title="Update Exchange Rate">
        <form onSubmit={handleSave} className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 17.50"
            className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
        {error && <Msg type="error">{error}</Msg>}
        {success && <Msg type="success">{success}</Msg>}
      </Card>

      <Card title="Rate History">
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No rates recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-semibold text-[#0f1f3d]">{parseFloat(r.usdToMxn).toFixed(4)}</span>
                <span className="text-xs text-[#5f7298]">{fmtDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function OptionListTab({
  title,
  singularLabel,
  fallback,
  loadOptions,
  saveOptions,
}: {
  title: string;
  singularLabel?: string;
  fallback: readonly string[];
  loadOptions: () => Promise<string[]>;
  saveOptions: (values: string[]) => Promise<void>;
}) {
  const resolvedSingularLabel = singularLabel ?? (title.endsWith("s") ? title.slice(0, -1) : title);
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await loadOptions();
      const normalized = (loaded.length > 0 ? loaded : [...fallback])
        .map((item) => String(item).trim())
        .filter(Boolean);
      setOptions(Array.from(new Set(normalized)));
    } catch {
      setOptions([...fallback]);
    } finally {
      setLoading(false);
    }
  }, [fallback, loadOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (nextOptions: string[]) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveOptions(nextOptions);
      setOptions(nextOptions);
      setSuccess(`${title} saved.`);
    } catch {
      setError(`Failed to save ${title.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  const addOption = async (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (options.some((option) => option.toLowerCase() === value.toLowerCase())) {
      setError("Value already exists.");
      return;
    }
    await persist([...options, value]);
    setDraft("");
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;
    const value = editValue.trim();
    if (!value) return;
    const next = [...options];
    next[editingIndex] = value;
    const unique = Array.from(new Set(next.map((item) => item.trim()).filter(Boolean)));
    await persist(unique);
    setEditingIndex(null);
    setEditValue("");
  };

  const deleteOption = async (index: number) => {
    const next = options.filter((_, currentIndex) => currentIndex !== index);
    await persist(next);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card title={`Manage ${title}`}>
        <form onSubmit={addOption} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Add ${resolvedSingularLabel}`}
            className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            Add
          </button>
        </form>
        {error && <Msg type="error">{error}</Msg>}
        {success && <Msg type="success">{success}</Msg>}
      </Card>

      {editingIndex !== null && (
        <Card title={`Edit ${resolvedSingularLabel}`}>
          <div className="space-y-3">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            />
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingIndex(null);
                  setEditValue("");
                }}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`${title} (${options.length})`}>
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No values configured.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {options.map((option, index) => (
              <li key={`${option}-${index}`} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex-1 text-sm font-medium text-[#0f1f3d]">{option}</span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => {
                      setEditingIndex(index);
                      setEditValue(option);
                    }}
                    className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteOption(index)}
                    disabled={saving}
                    className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function GradingTab() {
  return (
    <div className="space-y-6">
      <OptionListTab
        title="Grades"
        fallback={defaultGradeOptions}
        loadOptions={() => fetchGradeOptions({})}
        saveOptions={(values) => saveGradeOptions({ grades: values })}
      />
      <OptionListTab
        title="Condition"
        fallback={defaultConditionOptions}
        loadOptions={() => fetchConditionOptions({})}
        saveOptions={(values) => saveConditionOptions({ conditions: values })}
      />
      <OptionListTab
        title="Carriers"
        singularLabel="carrier"
        fallback={defaultCarrierOptions}
        loadOptions={() => fetchCarrierOptions()}
        saveOptions={(values) => saveCarrierOptions(values).then(() => undefined)}
      />
    </div>
  );
}

type ImeiCheck2IntegrationState = {
  linked: boolean;
  email?: string;
  keyLast4?: string;
  tokenValid?: boolean;
  tokenExpiresIn?: number;
};

function IntegrationsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<ImeiCheck2IntegrationState>({ linked: false });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [meRes, integrationRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/org/integrations/imeicheck2", { cache: "no-store" }),
      ]);

      if (meRes.ok) {
        const me = await meRes.json();
        setCanManage(Boolean(me?.permissions?.canManageOrgSettings) || Boolean(me?.session?.isSuperadmin));
      }

      const integrationPayload = await integrationRes.json().catch(() => ({}));
      if (!integrationRes.ok) {
        setErrorMessage(integrationPayload?.error ?? "Failed to load integration settings.");
        return;
      }

      const nextState = {
        linked: Boolean(integrationPayload?.linked),
        email: integrationPayload?.email ? String(integrationPayload.email) : undefined,
        keyLast4: integrationPayload?.keyLast4 ? String(integrationPayload.keyLast4) : undefined,
        tokenValid: Boolean(integrationPayload?.tokenValid),
        tokenExpiresIn: Number(integrationPayload?.tokenExpiresIn || 0),
      } satisfies ImeiCheck2IntegrationState;

      setState(nextState);
      if (!nextState.linked) {
        setEmail("");
        setApiKey("");
      } else if (nextState.email) {
        setEmail(nextState.email);
      }
    } catch {
      setErrorMessage("Failed to load integration settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    if (!email.trim() || !apiKey.trim()) {
      setErrorMessage("Email and API key are required.");
      return;
    }

    const normalizedApiKey = apiKey.trim();
    if (/^post\s+https?:\/\//i.test(normalizedApiKey) || /internal server error|bad request|fetch failed/i.test(normalizedApiKey)) {
      setErrorMessage("Invalid API key value. Paste your imeicheck provider API key, not a browser/network error message.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/integrations/imeicheck2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), apiKey: normalizedApiKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to link imeicheck2.");
        return;
      }

      setStatusMessage("imeicheck2 linked successfully.");
      setApiKey("");
      await load();
    } catch {
      setErrorMessage("Failed to link imeicheck2.");
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    if (!confirm("Unlink imeicheck2 from this organization?")) return;

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/integrations/imeicheck2", {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to unlink imeicheck2.");
        return;
      }

      setStatusMessage("imeicheck2 unlinked.");
      setState({ linked: false });
      setApiKey("");
      await load();
    } catch {
      setErrorMessage("Failed to unlink imeicheck2.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card title="Integrations · imeicheck2">
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : !canManage ? (
          <p className="text-sm text-[#5f7298]">You do not have permission to manage integrations.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#5f7298]">
              Link your imeicheck2 account with API key ownership verification. This stores your key securely and refreshes short-lived confirmation tokens automatically.
            </p>

            <div className="rounded-xl border border-[#d6e4ff] bg-[#f7fbff] px-4 py-3 text-sm text-[#1f3563]">
              {state.linked ? (
                <>
                  <p>
                    Status: <span className="font-semibold text-[#2a7c3b]">Linked</span>
                  </p>
                  <p>Email: <span className="font-medium">{state.email}</span></p>
                  <p>API Key: <span className="font-medium">••••{state.keyLast4}</span></p>
                  <p>
                    Token: <span className="font-medium">{state.tokenValid ? "Valid" : "Expired"}</span>
                    {state.tokenValid ? ` (${Math.max(0, Number(state.tokenExpiresIn || 0))}s)` : ""}
                  </p>
                </>
              ) : (
                <p>Status: <span className="font-semibold text-[#c24d34]">Not linked</span></p>
              )}
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-[#3b2a1e]">
                imeicheck2 account email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  placeholder="user@example.com"
                />
              </label>

              <label className="grid gap-1 text-sm text-[#3b2a1e]">
                imeicheck2 API key
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  placeholder={state.linked ? "Enter new key to relink" : "Paste API key"}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={saving}
                className="rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {saving ? "Saving..." : state.linked ? "Relink" : "Link imeicheck2"}
              </button>
              {state.linked && (
                <button
                  type="button"
                  onClick={unlink}
                  disabled={saving}
                  className="rounded-full border border-[#ff6b6b] px-5 py-2 text-sm font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60"
                >
                  Unlink
                </button>
              )}
            </div>
          </div>
        )}

        {errorMessage && <Msg type="error">{errorMessage}</Msg>}
        {statusMessage && <Msg type="success">{statusMessage}</Msg>}
      </Card>
    </div>
  );
}

type DIOWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type DIOSettings = {
  enabled: boolean;
  thresholdDays: number;
  weekdays: DIOWeekday[];
  time: string;
  timezone: string;
};

const WEEKDAY_OPTIONS: Array<{ key: DIOWeekday; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_DIO_SETTINGS: DIOSettings = {
  enabled: false,
  thresholdDays: 7,
  weekdays: ["mon", "fri"],
  time: "09:00",
  timezone: "America/Mexico_City",
};

function DIORemindersTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [hasProAccess, setHasProAccess] = useState(false);
  const [settings, setSettings] = useState<DIOSettings>(DEFAULT_DIO_SETTINGS);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/dio-reminders", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to load DIO settings.");
        return;
      }

      setHasProAccess(Boolean(payload?.hasProAccess));
      setSettings((payload?.settings as DIOSettings | undefined) ?? DEFAULT_DIO_SETTINGS);
    } catch {
      setErrorMessage("Failed to load DIO settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleWeekday = (day: DIOWeekday, checked: boolean) => {
    setSettings((prev) => {
      const next = checked
        ? Array.from(new Set([...prev.weekdays, day]))
        : prev.weekdays.filter((item) => item !== day);
      return { ...prev, weekdays: next };
    });
  };

  const save = async () => {
    if (settings.weekdays.length === 0) {
      setErrorMessage("Select at least one day.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || settings.timezone || "America/Mexico_City";
      const response = await fetch("/api/org/dio-reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...settings,
            timezone,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to save DIO settings.");
        return;
      }
      setSettings((payload?.settings as DIOSettings | undefined) ?? settings);
      setStatusMessage("DIO reminder settings saved.");
    } catch {
      setErrorMessage("Failed to save DIO settings.");
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/dio-reminders", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to send test DIO reminder.");
        return;
      }
      const recipients = Number(payload?.recipients ?? 0);
      const itemCount = Number(payload?.itemCount ?? 0);
      setStatusMessage(`Test DIO reminder sent to ${recipients} recipient${recipients === 1 ? "" : "s"} (${itemCount} item${itemCount === 1 ? "" : "s"}).`);
    } catch {
      setErrorMessage("Failed to send test DIO reminder.");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card title="DIO (Days Inventory Outstanding)">
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : !hasProAccess ? (
          <div className="space-y-3">
            <p className="text-sm text-[#5f7298]">
              DIO reminders are available on Pro plan only.
            </p>
            <a
              href="/billing"
              className="inline-flex rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Upgrade to Pro
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-[#0f1f3d]">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                className="rounded"
              />
              Enable DIO reminder emails
            </label>

            <label className="grid gap-1 text-sm text-[#3b2a1e]">
              Remind me when inventory reaches this age (days)
              <input
                type="number"
                min={1}
                max={365}
                value={settings.thresholdDays}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    thresholdDays: Math.max(1, Math.min(365, Number(event.target.value || 7))),
                  }))
                }
                className="w-40 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#3b2a1e]">Days of week</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {WEEKDAY_OPTIONS.map((day) => (
                  <label key={day.key} className="flex items-center gap-2 rounded-xl border border-[#d6e4ff] bg-white px-3 py-2 text-sm text-[#1f3563]">
                    <input
                      type="checkbox"
                      checked={settings.weekdays.includes(day.key)}
                      onChange={(event) => toggleWeekday(day.key, event.target.checked)}
                      className="rounded"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="grid gap-1 text-sm text-[#3b2a1e]">
              Time
              <input
                type="time"
                value={settings.time}
                onChange={(event) => setSettings((prev) => ({ ...prev, time: event.target.value || "09:00" }))}
                className="w-40 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              />
            </label>

            <p className="text-xs text-[#6a4d3a]">
              Reminder email includes IMEI, Model + Capacity + Color, and Days in Stock for devices at or above threshold.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save DIO Settings"}
              </button>
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={sendingTest}
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60"
              >
                {sendingTest ? "Sending test..." : "Send Test DIO Email Now"}
              </button>
            </div>
          </div>
        )}

        {errorMessage && <Msg type="error">{errorMessage}</Msg>}
        {statusMessage && <Msg type="success">{statusMessage}</Msg>}
      </Card>
    </div>
  );
}

function ReceiptTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);
  const [previewLayout, setPreviewLayout] = useState<ReceiptPrintLayout>("thermal80");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const previewReceipt = useMemo<SaleReceiptData>(
    () => ({
      companyName: "iCell Shop",
      saleId: "S-EXAMPLE-1024",
      soldAt: new Date().toISOString(),
      customerName: "John Doe",
      customerWhatsapp: "+1 305-555-0182",
      customerEmail: "john@example.com",
      paymentMethod: "Cash: 450, Card: 300",
      soldBy: "Admin User",
      notes: "Device sold with charger included.",
      receiptConfig: config,
      items: [
        {
          imei: "356789012345678",
          model: "iPhone 14 Pro",
          capacity: "256GB",
          color: "Space Black",
          salePrice: 750,
        },
        {
          imei: "352000111222333",
          model: "iPhone 13",
          capacity: "128GB",
          color: "Blue",
          salePrice: 380,
        },
      ],
      total: 1130,
    }),
    [config]
  );

  const previewDocument = useMemo(
    () => buildSaleReceiptDocument(previewReceipt, { layout: previewLayout }),
    [previewLayout, previewReceipt]
  );

  const printPreviewExample = () => {
    setErrorMessage("");
    try {
      printSaleReceipt(previewReceipt, { layout: previewLayout });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to open print preview.");
    }
  };

  const updateCustomLines = (position: "topLines" | "bottomLines", nextLines: ReceiptCustomLine[]) => {
    setConfig((prev) => ({ ...prev, [position]: nextLines }));
  };

  const addCustomLine = (position: "topLines" | "bottomLines") => {
    setConfig((prev) => {
      if (prev[position].length >= MAX_RECEIPT_CUSTOM_LINES) return prev;
      return {
        ...prev,
        [position]: [...prev[position], { text: "", bold: false }],
      };
    });
  };

  const updateCustomLine = (
    position: "topLines" | "bottomLines",
    index: number,
    nextLine: ReceiptCustomLine
  ) => {
    updateCustomLines(
      position,
      config[position].map((line, lineIndex) => (lineIndex === index ? nextLine : line))
    );
  };

  const removeCustomLine = (position: "topLines" | "bottomLines", index: number) => {
    updateCustomLines(
      position,
      config[position].filter((_, lineIndex) => lineIndex !== index)
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/receipt-config", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to load receipt settings.");
        return;
      }

      setConfig((payload?.config as ReceiptConfig | undefined) ?? DEFAULT_RECEIPT_CONFIG);
    } catch {
      setErrorMessage("Failed to load receipt settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await fetch("/api/org/receipt-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload?.error ?? "Failed to save receipt settings.");
        return;
      }

      setConfig((payload?.config as ReceiptConfig | undefined) ?? config);
      setStatusMessage("Receipt settings saved.");
    } catch {
      setErrorMessage("Failed to save receipt settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card title="Receipt Content">
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-[#0f1f3d]">
              <input
                type="checkbox"
                checked={config.showLogo}
                onChange={(event) => setConfig((prev) => ({ ...prev, showLogo: event.target.checked }))}
                className="rounded"
              />
              Show logo
            </label>

            <div className="space-y-3 rounded-2xl border border-[#d6e4ff] bg-[#f9fbff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0f1f3d]">Top lines</p>
                  <p className="text-xs text-[#5f7298]">Add up to {MAX_RECEIPT_CUSTOM_LINES} lines above the receipt details.</p>
                </div>
                <button
                  type="button"
                  onClick={() => addCustomLine("topLines")}
                  disabled={config.topLines.length >= MAX_RECEIPT_CUSTOM_LINES}
                  className="rounded-full border border-[#bfd4ff] px-4 py-1.5 text-xs font-semibold text-[#2563eb] transition hover:bg-[#eff5ff] disabled:opacity-50"
                >
                  Add top line
                </button>
              </div>

              <div className="space-y-2">
                {config.topLines.length === 0 ? (
                  <p className="text-xs text-[#6a4d3a]">No top lines added yet.</p>
                ) : (
                  config.topLines.map((line, index) => (
                    <div key={`top-line-${index}`} className="grid gap-2 rounded-xl border border-[#d6e4ff] bg-white p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <input
                        value={line.text}
                        maxLength={90}
                        onChange={(event) =>
                          updateCustomLine("topLines", index, { ...line, text: event.target.value })
                        }
                        placeholder={`Top line ${index + 1}`}
                        className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#1f3563]">
                        <input
                          type="checkbox"
                          checked={line.bold}
                          onChange={(event) =>
                            updateCustomLine("topLines", index, { ...line, bold: event.target.checked })
                          }
                          className="rounded"
                        />
                        Bold
                      </label>
                      <button
                        type="button"
                        onClick={() => removeCustomLine("topLines", index)}
                        className="rounded-full border border-[#ead8c6] px-4 py-1.5 text-xs font-semibold text-[#6a4d3a] transition hover:bg-[#fffaf3]"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-[#d6e4ff] bg-white px-3 py-2 text-sm text-[#1f3563]">
                <input
                  type="checkbox"
                  checked={config.showSeller}
                  onChange={(event) => setConfig((prev) => ({ ...prev, showSeller: event.target.checked }))}
                  className="rounded"
                />
                Seller checkbox
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-[#d6e4ff] bg-white px-3 py-2 text-sm text-[#1f3563]">
                <input
                  type="checkbox"
                  checked={config.showCustomerName}
                  onChange={(event) => setConfig((prev) => ({ ...prev, showCustomerName: event.target.checked }))}
                  className="rounded"
                />
                Customer name checkbox
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-[#d6e4ff] bg-white px-3 py-2 text-sm text-[#1f3563]">
                <input
                  type="checkbox"
                  checked={config.showCustomerPhone}
                  onChange={(event) => setConfig((prev) => ({ ...prev, showCustomerPhone: event.target.checked }))}
                  className="rounded"
                />
                Customer phone checkbox
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-[#d6e4ff] bg-white px-3 py-2 text-sm text-[#1f3563]">
                <input
                  type="checkbox"
                  checked={config.showCustomerEmail}
                  onChange={(event) => setConfig((prev) => ({ ...prev, showCustomerEmail: event.target.checked }))}
                  className="rounded"
                />
                Customer email checkbox
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#d6e4ff] bg-[#f9fbff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0f1f3d]">Bottom lines</p>
                  <p className="text-xs text-[#5f7298]">Add up to {MAX_RECEIPT_CUSTOM_LINES} lines below the total.</p>
                </div>
                <button
                  type="button"
                  onClick={() => addCustomLine("bottomLines")}
                  disabled={config.bottomLines.length >= MAX_RECEIPT_CUSTOM_LINES}
                  className="rounded-full border border-[#bfd4ff] px-4 py-1.5 text-xs font-semibold text-[#2563eb] transition hover:bg-[#eff5ff] disabled:opacity-50"
                >
                  Add bottom line
                </button>
              </div>

              <div className="space-y-2">
                {config.bottomLines.length === 0 ? (
                  <p className="text-xs text-[#6a4d3a]">No bottom lines added yet.</p>
                ) : (
                  config.bottomLines.map((line, index) => (
                    <div key={`bottom-line-${index}`} className="grid gap-2 rounded-xl border border-[#d6e4ff] bg-white p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <input
                        value={line.text}
                        maxLength={110}
                        onChange={(event) =>
                          updateCustomLine("bottomLines", index, { ...line, text: event.target.value })
                        }
                        placeholder={`Bottom line ${index + 1}`}
                        className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#1f3563]">
                        <input
                          type="checkbox"
                          checked={line.bold}
                          onChange={(event) =>
                            updateCustomLine("bottomLines", index, { ...line, bold: event.target.checked })
                          }
                          className="rounded"
                        />
                        Bold
                      </label>
                      <button
                        type="button"
                        onClick={() => removeCustomLine("bottomLines", index)}
                        className="rounded-full border border-[#ead8c6] px-4 py-1.5 text-xs font-semibold text-[#6a4d3a] transition hover:bg-[#fffaf3]"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <p className="text-xs text-[#6a4d3a]">
              Thermal print tip: in the print dialog, disable fit-to-page/scale options and keep margins minimal to avoid extra blank paper feed.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Receipt Settings"}
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#d6e4ff] bg-[#f9fbff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#0f1f3d]">Receipt print example</p>
                  <p className="text-xs text-[#5f7298]">Live preview using sample data and your current receipt settings.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={printPreviewExample}
                    className="rounded-full bg-[#1f1a16] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  >
                    Print this example
                  </button>
                  <div className="flex rounded-full border border-[#bfd4ff] bg-white p-1 text-xs font-semibold text-[#1f3563]">
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("thermal80")}
                    className={`rounded-full px-3 py-1 transition ${
                      previewLayout === "thermal80" ? "bg-[#2563eb] text-white" : "hover:bg-[#eff5ff]"
                    }`}
                  >
                    Thermal 80mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLayout("a4")}
                    className={`rounded-full px-3 py-1 transition ${
                      previewLayout === "a4" ? "bg-[#2563eb] text-white" : "hover:bg-[#eff5ff]"
                    }`}
                  >
                    A4
                  </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#d6e4ff] bg-white">
                <iframe
                  title="Receipt print preview"
                  srcDoc={previewDocument}
                  className="h-[520px] w-full"
                />
              </div>
            </div>
          </div>
        )}

        {errorMessage && <Msg type="error">{errorMessage}</Msg>}
        {statusMessage && <Msg type="success">{statusMessage}</Msg>}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d6e4ff] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">{title}</h2>
      {children}
    </div>
  );
}

function Msg({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={[
        "mt-1 rounded-xl px-3 py-2 text-sm",
        type === "error"
          ? "border border-[#ffd9d1] bg-[#fff6f3] text-[#c24d34]"
          : "border border-[#d1ffd9] bg-[#f3fff6] text-[#2a7c3b]",
      ].join(" ")}
    >
      {children}
    </p>
  );
}