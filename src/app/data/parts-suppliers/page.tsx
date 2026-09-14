"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type PartsSupplier = {
  id: string;
  name: string;
  status: string;
};

export default function PartsSuppliersDataPage() {
  const pathname = usePathname();
  const [suppliers, setSuppliers] = useState<PartsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meResponse, listResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/parts-suppliers", { cache: "no-store" }),
      ]);

      if (meResponse.ok) {
        const mePayload = await meResponse.json().catch(() => ({}));
        const canManage =
          Boolean(mePayload?.session?.isSuperadmin) ||
          Boolean(mePayload?.permissions?.canManageOrgSettings);
        if (!canManage) {
          setForbidden(true);
          setSuppliers([]);
          return;
        }
      }

      if (listResponse.status === 403) {
        setForbidden(true);
        setSuppliers([]);
        return;
      }

      const payload = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) {
        throw new Error(payload.error ?? "Failed to load parts suppliers.");
      }

      setForbidden(false);
      setSuppliers(payload.suppliers ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load parts suppliers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftName.trim()) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/parts-suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to add parts supplier.");
      }

      setDraftName("");
      setSuccess("Parts supplier added.");
      await loadSuppliers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add parts supplier.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/parts-suppliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update parts supplier.");
      }

      setEditingId(null);
      setEditName("");
      setSuccess("Parts supplier updated.");
      await loadSuppliers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update parts supplier.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (supplier: PartsSupplier) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/parts-suppliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: supplier.id,
          status: supplier.status === "Active" ? "Inactive" : "Active",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update parts supplier status.");
      }

      await loadSuppliers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update parts supplier status.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: PartsSupplier) => {
    if (!window.confirm(`Delete parts supplier \"${supplier.name}\"?`)) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/parts-suppliers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: supplier.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete parts supplier.");
      }

      setSuccess("Parts supplier deleted.");
      await loadSuppliers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to delete parts supplier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f8ff]">
      <AppSidebar pathname={pathname} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4c6cb3]">Data Admin</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#112146]">Parts suppliers</h1>
            <p className="mt-2 text-sm text-[#5a6d93]">
              Manage the dedicated parts supplier directory used by repair tickets.
            </p>
            <div className="mt-4">
              <Link
                href="/data"
                className="inline-flex rounded-2xl border border-[#cfe0ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff5ff]"
              >
                Back to Data Admin
              </Link>
            </div>
          </div>

          {forbidden && (
            <div className="rounded-2xl bg-white p-6 text-sm font-medium text-red-600 shadow-sm ring-1 ring-[#dbe7ff]">
              You do not have permission to manage parts suppliers.
            </div>
          )}

          {!forbidden && (
            <>
              {(error || success) && (
                <div
                  className={[
                    "rounded-2xl bg-white p-4 text-sm font-medium shadow-sm ring-1 ring-[#dbe7ff]",
                    error ? "text-red-600" : "text-[#1d4ed8]",
                  ].join(" ")}
                >
                  {error || success}
                </div>
              )}

              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                <h2 className="text-lg font-semibold text-[#112146]">Add parts supplier</h2>
                <form onSubmit={handleCreate} className="mt-4 flex gap-3">
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="Supplier name"
                    className="flex-1 rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Add"}
                  </button>
                </form>
              </section>

              {editingId && (
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                  <h2 className="text-lg font-semibold text-[#112146]">Edit parts supplier</h2>
                  <div className="mt-4 space-y-3">
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleUpdate}
                        disabled={saving}
                        className="rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                        className="rounded-2xl border border-[#cfe0ff] px-5 py-3 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                <h2 className="text-lg font-semibold text-[#112146]">Parts suppliers ({suppliers.length})</h2>
                {loading ? (
                  <p className="mt-4 text-sm text-[#5a6d93]">Loading suppliers...</p>
                ) : suppliers.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5a6d93]">No parts suppliers yet.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-[#edf3ff]">
                    {suppliers.map((supplier) => (
                      <li key={supplier.id} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-medium text-[#112146]">{supplier.name}</p>
                          <p className="text-xs text-[#6b7fa8]">{supplier.status}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(supplier)}
                            disabled={saving}
                            className="rounded-full border border-[#cfe0ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff] disabled:opacity-60"
                          >
                            {supplier.status === "Active" ? "Set inactive" : "Set active"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(supplier.id);
                              setEditName(supplier.name);
                            }}
                            disabled={saving}
                            className="rounded-full border border-[#cfe0ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff] disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(supplier)}
                            disabled={saving}
                            className="rounded-full border border-[#fecaca] px-3 py-1 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fee2e2] disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
