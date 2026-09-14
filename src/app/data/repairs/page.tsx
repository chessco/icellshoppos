"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

// ─── Types ───────────────────────────────────────────────────────────────────

type TypicalFailure = {
  id: string;
  name: string;
  status: string;
};

type RepairCustomer = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  status: string;
};

type BrandEntry = { name: string; models: string[] };
type RepairCatalog = { brands: BrandEntry[]; colors: string[] };

type Tab = "failures" | "catalog" | "customers" | "parts-suppliers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Msg({ type, children }: { type: "error" | "success"; children: string }) {
  return (
    <p className={["mt-2 text-sm font-medium", type === "error" ? "text-red-600" : "text-green-700"].join(" ")}>
      {children}
    </p>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#dbe7ff]">
      <h3 className="mb-4 text-base font-semibold text-[#112146]">{title}</h3>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RepairDataPage() {
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("failures");
  const [forbidden, setForbidden] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((me) => {
        const ok =
          Boolean(me?.session?.isSuperadmin) ||
          Boolean(me?.permissions?.canManageRepairs) ||
          Boolean(me?.permissions?.canManageOrgSettings);
        const settings =
          Boolean(me?.session?.isSuperadmin) ||
          Boolean(me?.permissions?.canManageOrgSettings);
        if (!ok) setForbidden(true);
        setCanManageSettings(settings);
      })
      .catch(() => setForbidden(true));
  }, []);

  if (forbidden) {
    return (
      <div className="flex min-h-screen bg-[#f4f8ff]">
        <AppSidebar pathname={pathname} />
        <main className="flex-1 p-6">
          <p className="text-sm text-red-600">You do not have permission to access this page.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f4f8ff]">
      <AppSidebar pathname={pathname} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[#d6e4ff] bg-white px-6 py-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4c6cb3]">Data Admin</p>
          <h1 className="mt-1 text-2xl font-bold text-[#0f1f3d]">Repair Data</h1>
          <p className="mt-1 text-sm text-[#5f7298]">
            Manage typical failures, device catalog, repair customers, and parts suppliers.
          </p>
          <div className="mt-3">
            <Link href="/data" className="inline-flex rounded-xl border border-[#cfe0ff] px-3 py-2 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff]">
              Back to Data Admin
            </Link>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[#d6e4ff] bg-white px-6">
          {(["failures", "catalog", "customers", "parts-suppliers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-3 text-sm font-medium transition border-b-2",
                tab === t ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-[#5f7298] hover:text-[#1f3563]",
              ].join(" ")}
            >
              {t === "failures" ? "Typical Failures" : t === "catalog" ? "Device Catalog" : t === "customers" ? "Repair Customers" : "Parts Suppliers"}
            </button>
          ))}
        </div>

        <div className="flex-1 px-6 py-6">
          {tab === "failures" && <TypicalFailuresTab canManage={canManageSettings} />}
          {tab === "catalog" && <DeviceCatalogTab canManage={canManageSettings} />}
          {tab === "customers" && <RepairCustomersTab canManage={canManageSettings} />}
          {tab === "parts-suppliers" && (
            <div className="max-w-lg space-y-4">
              <p className="text-sm text-[#5f7298]">Parts suppliers are managed on a dedicated page.</p>
              <Link
                href="/data/parts-suppliers"
                className="inline-flex rounded-2xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
              >
                Manage Parts Suppliers
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Typical Failures Tab ─────────────────────────────────────────────────────

function TypicalFailuresTab({ canManage }: { canManage: boolean }) {
  const [failures, setFailures] = useState<TypicalFailure[]>([]);
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
      const res = await fetch("/api/repair-typical-failures");
      const data = await res.json();
      setFailures(data.failures ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-typical-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add failure."); return; }
      setSuccess(`"${draft.trim()}" added.`);
      setDraft("");
      await load();
    } catch { setError("Failed to add failure."); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-typical-failures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName.trim() }),
      });
      if (!res.ok) { setError("Failed to update."); return; }
      setEditingId(null); setEditName(""); setSuccess("Updated.");
      await load();
    } catch { setError("Failed to update."); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (f: TypicalFailure) => {
    await fetch("/api/repair-typical-failures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, status: f.status === "Active" ? "Inactive" : "Active" }),
    });
    await load();
  };

  const handleDelete = async (f: TypicalFailure) => {
    if (!window.confirm(`Delete "${f.name}"?`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-typical-failures", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id }),
      });
      if (!res.ok) { setError("Failed to delete."); return; }
      setSuccess("Deleted.");
      await load();
    } catch { setError("Failed to delete."); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {canManage && (
        <Card title="Add Typical Failure">
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Screen, Battery, Charging port..."
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
      )}

      {editingId && canManage && (
        <Card title="Edit Failure">
          <div className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
            />
            <div className="flex gap-2">
              <button onClick={handleUpdate} disabled={saving} className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditingId(null)} className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]">
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`Failures (${failures.length})`}>
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : failures.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No typical failures yet. Add some to speed up repair intake.</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {failures.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className={["flex-1 text-sm font-medium", f.status === "Inactive" ? "text-[#9fb3cc] line-through" : "text-[#0f1f3d]"].join(" ")}>
                  {f.name}
                </span>
                {canManage && (
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => toggleStatus(f)} className={["rounded-full px-3 py-1 text-xs font-semibold transition", f.status === "Active" ? "bg-[#eef5ff] text-[#2563eb] hover:bg-[#d6e8ff]" : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]"].join(" ")}>
                      {f.status}
                    </button>
                    <button onClick={() => { setEditingId(f.id); setEditName(f.name); }} disabled={saving} className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(f)} disabled={saving} className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Device Catalog Tab ───────────────────────────────────────────────────────

function DeviceCatalogTab({ canManage }: { canManage: boolean }) {
  const [catalog, setCatalog] = useState<RepairCatalog>({ brands: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newColor, setNewColor] = useState("");
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [newModel, setNewModel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/repair-catalog");
      const data = await res.json();
      setCatalog(data.catalog ?? { brands: [], colors: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (updated: RepairCatalog) => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalog: updated }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
      setCatalog(data.catalog);
      setSuccess("Saved.");
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  const addBrand = async (e: FormEvent) => {
    e.preventDefault();
    const name = newBrand.trim();
    if (!name || catalog.brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) return;
    const updated = { ...catalog, brands: [...catalog.brands, { name, models: [] }] };
    setNewBrand("");
    await save(updated);
  };

  const removeBrand = async (name: string) => {
    if (!window.confirm(`Remove brand "${name}" and all its models?`)) return;
    const updated = { ...catalog, brands: catalog.brands.filter((b) => b.name !== name) };
    await save(updated);
  };

  const addModel = async (brandName: string, e: FormEvent) => {
    e.preventDefault();
    const model = newModel.trim();
    if (!model) return;
    const updated = {
      ...catalog,
      brands: catalog.brands.map((b) =>
        b.name === brandName && !b.models.includes(model)
          ? { ...b, models: [...b.models, model].sort() }
          : b
      ),
    };
    setNewModel("");
    await save(updated);
  };

  const removeModel = async (brandName: string, model: string) => {
    const updated = {
      ...catalog,
      brands: catalog.brands.map((b) =>
        b.name === brandName ? { ...b, models: b.models.filter((m) => m !== model) } : b
      ),
    };
    await save(updated);
  };

  const addColor = async (e: FormEvent) => {
    e.preventDefault();
    const color = newColor.trim();
    if (!color || catalog.colors.includes(color)) return;
    const updated = { ...catalog, colors: [...catalog.colors, color].sort() };
    setNewColor("");
    await save(updated);
  };

  const removeColor = async (color: string) => {
    const updated = { ...catalog, colors: catalog.colors.filter((c) => c !== color) };
    await save(updated);
  };

  if (loading) return <p className="text-sm text-[#5f7298]">Loading...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {(error || success) && (
        <div className={["rounded-xl p-3 text-sm font-medium", error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"].join(" ")}>
          {error || success}
        </div>
      )}

      {/* Brands & Models */}
      <Card title="Brands & Models">
        {canManage && (
          <form onSubmit={addBrand} className="mb-4 flex gap-2">
            <input
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              placeholder="New brand name (e.g. Apple, Samsung)"
              className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              required
            />
            <button type="submit" disabled={saving} className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
              Add Brand
            </button>
          </form>
        )}
        {catalog.brands.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No brands yet.</p>
        ) : (
          <div className="space-y-2">
            {catalog.brands.map((brand) => (
              <div key={brand.name} className="rounded-xl border border-[#dbe7ff] bg-[#f8fbff]">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <button
                    onClick={() => setExpandedBrand(expandedBrand === brand.name ? null : brand.name)}
                    className="flex items-center gap-2 text-sm font-semibold text-[#112146] hover:text-[#2563eb]"
                  >
                    <span>{expandedBrand === brand.name ? "▾" : "▸"}</span>
                    {brand.name}
                    <span className="rounded-full bg-[#e8f0ff] px-2 py-0.5 text-xs font-medium text-[#4c6cb3]">
                      {brand.models.length} models
                    </span>
                  </button>
                  {canManage && (
                    <button onClick={() => removeBrand(brand.name)} disabled={saving} className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60">
                      Remove
                    </button>
                  )}
                </div>
                {expandedBrand === brand.name && (
                  <div className="border-t border-[#dbe7ff] px-4 py-3 space-y-3">
                    {canManage && (
                      <form onSubmit={(e) => addModel(brand.name, e)} className="flex gap-2">
                        <input
                          value={newModel}
                          onChange={(e) => setNewModel(e.target.value)}
                          placeholder={`Add model for ${brand.name}`}
                          className="flex-1 rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                          required
                        />
                        <button type="submit" disabled={saving} className="rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
                          Add
                        </button>
                      </form>
                    )}
                    {brand.models.length === 0 ? (
                      <p className="text-xs text-[#9fb3cc]">No models yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {brand.models.map((model) => (
                          <span key={model} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#1f3563] ring-1 ring-[#dbe7ff]">
                            {model}
                            {canManage && (
                              <button onClick={() => removeModel(brand.name, model)} disabled={saving} className="ml-1 text-[#9fb3cc] transition hover:text-red-500 disabled:opacity-40">
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Colors */}
      <Card title="Colors">
        {canManage && (
          <form onSubmit={addColor} className="mb-4 flex gap-2">
            <input
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              placeholder="e.g. Black, White, Midnight, Starlight..."
              className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
              required
            />
            <button type="submit" disabled={saving} className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
              Add
            </button>
          </form>
        )}
        {catalog.colors.length === 0 ? (
          <p className="text-sm text-[#5f7298]">No colors yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {catalog.colors.map((color) => (
              <span key={color} className="inline-flex items-center gap-1 rounded-full bg-[#f7fbff] px-3 py-1.5 text-sm font-medium text-[#1f3563] ring-1 ring-[#dbe7ff]">
                {color}
                {canManage && (
                  <button onClick={() => removeColor(color)} disabled={saving} className="ml-1 text-[#9fb3cc] transition hover:text-red-500 disabled:opacity-40">
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Repair Customers Tab ─────────────────────────────────────────────────────

function RepairCustomersTab({ canManage }: { canManage: boolean }) {
  const [customers, setCustomers] = useState<RepairCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Add form
  const [addName, setAddName] = useState("");
  const [addWhatsapp, setAddWhatsapp] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addNotes, setAddNotes] = useState("");
  // Edit form
  const [editName, setEditName] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/repair-customers");
      const data = await res.json();
      setCustomers(data.customers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), whatsapp: addWhatsapp.trim() || null, email: addEmail.trim() || null, notes: addNotes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add."); return; }
      setSuccess(`"${addName.trim()}" added.`);
      setAddName(""); setAddWhatsapp(""); setAddEmail(""); setAddNotes("");
      await load();
    } catch { setError("Failed to add."); }
    finally { setSaving(false); }
  };

  const startEdit = (c: RepairCustomer) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditWhatsapp(c.whatsapp ?? "");
    setEditEmail(c.email ?? "");
    setEditNotes(c.notes ?? "");
    setError(""); setSuccess("");
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName.trim(), whatsapp: editWhatsapp.trim() || null, email: editEmail.trim() || null, notes: editNotes.trim() || null }),
      });
      if (!res.ok) { setError("Failed to update."); return; }
      setEditingId(null); setSuccess("Updated.");
      await load();
    } catch { setError("Failed to update."); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (c: RepairCustomer) => {
    await fetch("/api/repair-customers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status: c.status === "Active" ? "Inactive" : "Active" }),
    });
    await load();
  };

  const handleDelete = async (c: RepairCustomer) => {
    if (!window.confirm(`Delete customer "${c.name}"?`)) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/repair-customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      if (!res.ok) { setError("Failed to delete."); return; }
      setSuccess("Deleted.");
      await load();
    } catch { setError("Failed to delete."); }
    finally { setSaving(false); }
  };

  const filtered = search.trim()
    ? customers.filter((c) => [c.name, c.whatsapp, c.email].some((v) => v?.toLowerCase().includes(search.toLowerCase())))
    : customers;

  return (
    <div className="max-w-3xl space-y-5">
      {canManage && (
        <Card title="Add Repair Customer">
          <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-2">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name *" required className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={addWhatsapp} onChange={(e) => setAddWhatsapp(e.target.value)} placeholder="WhatsApp (e.g. +521234567890)" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email (optional)" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Notes (optional)" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
                {saving ? "Adding..." : "Add Customer"}
              </button>
            </div>
          </form>
          {error && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
        </Card>
      )}

      {editingId && canManage && (
        <Card title="Edit Customer">
          <div className="grid gap-3 md:grid-cols-2">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name *" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)} placeholder="WhatsApp" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
            <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes" className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleUpdate} disabled={saving} className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditingId(null)} className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#f7fbff]">
              Cancel
            </button>
          </div>
        </Card>
      )}

      <Card title={`Customers (${customers.length})`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, WhatsApp, or email..."
          className="mb-4 w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
        />
        {loading ? (
          <p className="text-sm text-[#5f7298]">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[#5f7298]">{search ? "No matches found." : "No repair customers yet."}</p>
        ) : (
          <ul className="divide-y divide-[#eef4ff]">
            {filtered.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className={["text-sm font-semibold", c.status === "Inactive" ? "text-[#9fb3cc] line-through" : "text-[#0f1f3d]"].join(" ")}>
                    {c.name}
                  </p>
                  {c.whatsapp && <p className="text-xs text-[#5f7298]">{c.whatsapp}</p>}
                  {c.email && <p className="text-xs text-[#5f7298]">{c.email}</p>}
                  {c.notes && <p className="mt-0.5 text-xs text-[#8fa0bf] italic">{c.notes}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => toggleStatus(c)} className={["rounded-full px-3 py-1 text-xs font-semibold transition", c.status === "Active" ? "bg-[#eef5ff] text-[#2563eb] hover:bg-[#d6e8ff]" : "bg-[#f3f3f3] text-[#888] hover:bg-[#e8e8e8]"].join(" ")}>
                      {c.status}
                    </button>
                    <button onClick={() => startEdit(c)} disabled={saving} className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f7fbff] disabled:opacity-60">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(c)} disabled={saving} className="rounded-full border border-[#ff6b6b] px-3 py-1 text-xs font-semibold text-[#ff6b6b] transition hover:bg-[#ffe0e0] disabled:opacity-60">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
