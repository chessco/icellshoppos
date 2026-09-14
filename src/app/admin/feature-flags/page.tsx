
"use client";

type FeatureFlag = {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
};

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";


function FeatureFlagsPage() {
  const pathname = usePathname();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FeatureFlag>({ id: "", key: "", description: "", enabled: false });
  const [creating, setCreating] = useState(false);
  const [newFlag, setNewFlag] = useState<Omit<FeatureFlag, "id">>({ key: "", description: "", enabled: false });
  const [orgOverride, setOrgOverride] = useState<Record<string, { orgId: string; enabled: boolean }>>({});

  useEffect(() => {
    fetch("/api/admin/feature-flags")
      .then((res) => res.json())
      .then((data) => {
        setFlags(data.flags || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load feature flags");
        setLoading(false);
      });
  }, []);


  const handleEdit = (flag: FeatureFlag) => {
    setEditing(flag.id);
    setForm({ ...flag });
  };


  const handleDelete = async (flagId: string) => {
    if (!window.confirm("Delete this feature flag?")) return;
    try {
      const res = await fetch(`/api/admin/feature-flags?id=${flagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete flag");
      setFlags((prev) => prev.filter((f: FeatureFlag) => f.id !== flagId));
    } catch (err: any) {
      alert("Error deleting flag: " + (err?.message || err));
    }
  };


  const handleOrgOverride = async (flagId: string, orgId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/admin/feature-flags/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, orgId, enabled }),
      });
      if (!res.ok) throw new Error("Failed to set override");
      alert("Override set!");
    } catch (err: any) {
      alert("Error setting override: " + (err?.message || err));
    }
  };


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };


  const handleSave = async () => {
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to update flag");
      const data = await res.json();
      setFlags((prev) => prev.map((f: FeatureFlag) => (f.id === form.id ? data.flag : f)));
      setEditing(null);
    } catch (err: any) {
      alert("Error saving flag: " + (err?.message || err));
    }
  };


  const handleCreate = async () => {
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFlag),
      });
      if (!res.ok) throw new Error("Failed to create flag");
      const data = await res.json();
      setFlags((prev) => [...prev, data.flag]);
      setNewFlag({ key: "", description: "", enabled: false });
      setCreating(false);
    } catch (err: any) {
      alert("Error creating flag: " + (err?.message || err));
    }
  };

  const handleCancel = () => setEditing(null);

  // --- Component Render ---
  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Feature Flags</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Feature Flags</h1>
            <p className="text-sm text-[#6a4d3a]">Toggle features on/off for all users or organizations.</p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-[#1f1a16]">Flags</h2>
              <button className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white" onClick={() => setCreating((v) => !v)}>{creating ? "Cancel" : "Add Flag"}</button>
            </div>
            {creating && (
              <div className="mb-4 flex flex-wrap gap-2 items-center bg-[#fff6ea] p-4 rounded-xl border border-[#e6d6c6]">
                <input name="key" placeholder="Key" value={newFlag.key} onChange={e => setNewFlag(f => ({ ...f, key: e.target.value }))} className="rounded-xl border border-[#e6d6c6] px-2 py-1" />
                <input name="description" placeholder="Description" value={newFlag.description} onChange={e => setNewFlag(f => ({ ...f, description: e.target.value }))} className="rounded-xl border border-[#e6d6c6] px-2 py-1" />
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={newFlag.enabled} onChange={e => setNewFlag(f => ({ ...f, enabled: e.target.checked }))} />Enabled</label>
                <button className="rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white" onClick={handleCreate}>Create</button>
              </div>
            )}
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div className="text-red-600">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#f7f2ec]">
                      <th className="px-3 py-2 text-left">Key</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Enabled</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((flag: FeatureFlag) => (
                      <tr key={flag.id} className="border-b border-[#e6d6c6]">
                        {editing === flag.id ? (
                          <>
                            <td className="px-3 py-2"><input name="key" value={form.key} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                            <td className="px-3 py-2"><input name="description" value={form.description} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                            <td className="px-3 py-2"><input name="enabled" type="checkbox" checked={form.enabled} onChange={handleChange} /></td>
                            <td className="px-3 py-2">
                              <button onClick={handleSave} className="mr-2 rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white">Save</button>
                              <button onClick={handleCancel} className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{flag.key}</td>
                            <td className="px-3 py-2">{flag.description}</td>
                            <td className="px-3 py-2">{flag.enabled ? "Yes" : "No"}</td>
                            <td className="px-3 py-2 flex gap-2">
                              <button onClick={() => handleEdit(flag)} className="rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white">Edit</button>
                              <button onClick={() => handleDelete(flag.id)} className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {flags.length === 0 && <div className="text-[#6a4d3a] mt-4">No feature flags found.</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default FeatureFlagsPage;

