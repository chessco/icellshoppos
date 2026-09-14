"use client";


import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type PlanRow = {
  id: string;
  name: string;
  code: string;
  basePriceCents: number;
  includedSeats: number;
  extraSeatPriceCents: number;
  trialDays: number;
  active: boolean;
};

type PlanForm = PlanRow;

export default function AdminPlansPage() {
  const pathname = usePathname();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>({
    id: "",
    name: "",
    code: "",
    basePriceCents: 0,
    includedSeats: 1,
    extraSeatPriceCents: 0,
    trialDays: 14,
    active: true,
  });

  useEffect(() => {
    fetch("/api/org/plans")
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.plans || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load plans");
        setLoading(false);
      });
  }, []);

  const handleEdit = (plan: PlanRow) => {
    setEditing(plan.id);
    setForm({ ...plan });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev: PlanForm) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "includedSeats" || name === "trialDays"
            ? Number(value)
            : value,
    }) as PlanForm);
  };


  const handleSave = async () => {
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to update plan");
      const data = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === form.id ? (data.plan as PlanRow) : p)));
      setEditing(null);
    } catch (err: unknown) {
      alert("Error saving plan: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancel = () => {
    setEditing(null);
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;


  // Format cents to dollars for display
  const formatDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Plans</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Manage Plans</h1>
            <p className="text-sm text-[#6a4d3a]">Create, edit, or deactivate subscription plans for your SaaS.</p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">Plans</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-[#f7f2ec]">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Seats</th>
                    <th className="px-3 py-2 text-left">Extra Seat</th>
                    <th className="px-3 py-2 text-left">Trial Days</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b border-[#e6d6c6]">
                      {editing === plan.id ? (
                        <>
                          <td className="px-3 py-2"><input name="name" value={form.name} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="code" value={form.code} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="basePriceCents" type="number" value={form.basePriceCents / 100} onChange={(e) => setForm((prev) => ({ ...prev, basePriceCents: Math.round(Number(e.target.value) * 100) }))} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="includedSeats" type="number" value={form.includedSeats} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="extraSeatPriceCents" type="number" value={form.extraSeatPriceCents / 100} onChange={(e) => setForm((prev) => ({ ...prev, extraSeatPriceCents: Math.round(Number(e.target.value) * 100) }))} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="trialDays" type="number" value={form.trialDays} onChange={handleChange} className="rounded-xl border border-[#e6d6c6] px-2 py-1 w-full" /></td>
                          <td className="px-3 py-2"><input name="active" type="checkbox" checked={form.active} onChange={handleChange} /></td>
                          <td className="px-3 py-2">
                            <button onClick={handleSave} className="mr-2 rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white">Save</button>
                            <button onClick={handleCancel} className="rounded-full border border-[#d6c1ad] px-4 py-2 text-sm font-semibold text-[#3b2a1e]">Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{plan.name}</td>
                          <td className="px-3 py-2">{plan.code}</td>
                          <td className="px-3 py-2">{formatDollars(plan.basePriceCents)}</td>
                          <td className="px-3 py-2">{plan.includedSeats}</td>
                          <td className="px-3 py-2">{formatDollars(plan.extraSeatPriceCents)}</td>
                          <td className="px-3 py-2">{plan.trialDays}</td>
                          <td className="px-3 py-2">{plan.active ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => handleEdit(plan)} className="rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white">Edit</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

