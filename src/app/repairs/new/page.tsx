"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { WHATSAPP_COUNTRY_CODES } from "@/lib/whatsapp";

type PartsSupplier = {
  id: string;
  name: string;
};

type RepairCustomer = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
};

type TypicalFailure = {
  id: string;
  name: string;
  status: string;
};

type BrandEntry = { name: string; models: string[] };
type RepairCatalog = { brands: BrandEntry[]; colors: string[] };

const extraOptions = ["Case", "SIM card", "SD card"];

export default function NewRepairPage() {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [imei, setImei] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsappCountryCode, setCustomerWhatsappCountryCode] = useState<string>(WHATSAPP_COUNTRY_CODES[0]);
  const [customerWhatsappNumber, setCustomerWhatsappNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [intakeDiagnosisText, setIntakeDiagnosisText] = useState("");
  const [possibleFixText, setPossibleFixText] = useState("");
  const [diagnosisPending, setDiagnosisPending] = useState(true);
  const [quotedTotal, setQuotedTotal] = useState("");
  const [partsSupplierId, setPartsSupplierId] = useState("");
  const [partsCost, setPartsCost] = useState("");
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedFailures, setSelectedFailures] = useState<string[]>([]);
  const [failureSearch, setFailureSearch] = useState("");
  const [addingCustomFailure, setAddingCustomFailure] = useState(false);
  const [suppliers, setSuppliers] = useState<PartsSupplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [typicalFailures, setTypicalFailures] = useState<TypicalFailure[]>([]);
  const [catalog, setCatalog] = useState<RepairCatalog>({ brands: [], colors: [] });
  const [repairCustomers, setRepairCustomers] = useState<RepairCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        setLoadingSuppliers(true);
        const response = await fetch("/api/parts-suppliers");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load parts suppliers.");
        }
        setSuppliers((payload.suppliers ?? []).filter((s: PartsSupplier & { status?: string }) => s.status !== "Inactive"));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load parts suppliers.");
      } finally {
        setLoadingSuppliers(false);
      }
    };

    void loadSuppliers();
  }, []);

  useEffect(() => {
    void fetch("/api/repair-typical-failures")
      .then((r) => r.json())
      .then((d) => setTypicalFailures((d.failures ?? []).filter((f: TypicalFailure) => f.status === "Active")))
      .catch(() => {});
    void fetch("/api/repair-catalog")
      .then((r) => r.json())
      .then((d) => setCatalog(d.catalog ?? { brands: [], colors: [] }))
      .catch(() => {});
    void fetch("/api/repair-customers")
      .then((r) => r.json())
      .then((d) => setRepairCustomers((d.customers ?? []).filter((c: RepairCustomer & { status?: string }) => c.status !== "Inactive")))
      .catch(() => {});
  }, []);

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const effectiveFailures = useMemo(() => {
    return [...selectedFailures];
  }, [selectedFailures]);

  // Failures filtered by search
  const filteredFailures = useMemo(() => {
    const q = failureSearch.trim().toLowerCase();
    if (!q) return typicalFailures;
    return typicalFailures.filter((f) => f.name.toLowerCase().includes(q));
  }, [failureSearch, typicalFailures]);

  const failureSearchIsNew = useMemo(() => {
    const q = failureSearch.trim().toLowerCase();
    if (!q) return false;
    return !typicalFailures.some((f) => f.name.toLowerCase() === q);
  }, [failureSearch, typicalFailures]);

  const addCustomFailureToDb = async () => {
    const name = failureSearch.trim();
    if (!name) return;
    setAddingCustomFailure(true);
    try {
      const res = await fetch("/api/repair-typical-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.failure) {
        setTypicalFailures((prev) => [...prev, data.failure as TypicalFailure].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedFailures((prev) => [...prev, name]);
        setFailureSearch("");
      }
    } finally {
      setAddingCustomFailure(false);
    }
  };

  const selectRepairCustomer = (c: RepairCustomer) => {
    setCustomerName(c.name);
    setCustomerEmail(c.email ?? "");
    if (c.whatsapp) {
      const wc = WHATSAPP_COUNTRY_CODES.find((code) => c.whatsapp!.startsWith(code)) ?? WHATSAPP_COUNTRY_CODES[0];
      setCustomerWhatsappCountryCode(wc);
      setCustomerWhatsappNumber(c.whatsapp.slice(wc.length));
    }
    setCustomerSearch("");
    setShowCustomerDropdown(false);
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return repairCustomers.slice(0, 8);
    return repairCustomers.filter((c) =>
      [c.name, c.whatsapp, c.email].some((v) => v?.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [customerSearch, repairCustomers]);

  // Brand-model helpers
  const brandOptions = catalog.brands.map((b) => b.name);
  const modelOptions = useMemo(() => {
    const found = catalog.brands.find((b) => b.name.toLowerCase() === brand.toLowerCase());
    return found ? found.models : [];
  }, [catalog.brands, brand]);

  const toggleValue = (currentValues: string[], value: string) =>
    currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");

      const response = await fetch("/api/repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          model,
          color,
          imei,
          customerName,
          customerEmail,
          whatsappCountryCode: customerWhatsappCountryCode,
          whatsappNumber: customerWhatsappNumber,
          notes,
          intakeDiagnosisText,
          possibleFixText,
          diagnosisPending,
          quotedTotal: diagnosisPending ? null : quotedTotal,
          partsSupplierId: partsSupplierId || null,
          partsCost: partsCost || null,
          extras: selectedExtras,
          intakeFailures: effectiveFailures,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create repair ticket.");
      }

      router.push(`/repairs/${payload.ticket.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create repair ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f0f6ff]">
      <AppSidebar pathname="/repairs" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4c6cb3]">Receive</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#112146]">Receive repair ticket</h1>
            <p className="mt-2 text-sm text-[#5a6d93]">
              Capture intake details, customer contact info, first diagnosis, and internal supplier/cost data.
            </p>
          </div>

          {error && (
            <div className="rounded-2xl bg-white p-4 text-sm font-medium text-red-600 shadow-sm ring-1 ring-[#dbe7ff]">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
              <h2 className="text-lg font-semibold text-[#112146]">Device</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Brand</span>
                  <input value={brand} onChange={(event) => setBrand(event.target.value)} list="catalog-brands" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                  {brandOptions.length > 0 && (
                    <datalist id="catalog-brands">
                      {brandOptions.map((b) => <option key={b} value={b} />)}
                    </datalist>
                  )}
                </label>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Model</span>
                  <input value={model} onChange={(event) => setModel(event.target.value)} list="catalog-models" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                  {modelOptions.length > 0 && (
                    <datalist id="catalog-models">
                      {modelOptions.map((m) => <option key={m} value={m} />)}
                    </datalist>
                  )}
                </label>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Color</span>
                  <input value={color} onChange={(event) => setColor(event.target.value)} list="catalog-colors" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                  {catalog.colors.length > 0 && (
                    <datalist id="catalog-colors">
                      {catalog.colors.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  )}
                </label>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">IMEI (optional)</span>
                  <input value={imei} onChange={(event) => setImei(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                </label>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-[#1f3563]">Extras</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {extraOptions.map((extra) => (
                    <label key={extra} className="inline-flex items-center gap-2 rounded-full bg-[#f7faff] px-4 py-2 text-sm text-[#1f3563] ring-1 ring-[#dbe7ff]">
                      <input type="checkbox" checked={selectedExtras.includes(extra)} onChange={() => setSelectedExtras((current) => toggleValue(current, extra))} />
                      {extra}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
              <h2 className="text-lg font-semibold text-[#112146]">Customer</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Customer name</span>
                  {repairCustomers.length > 0 && (
                    <div ref={customerSearchRef} className="relative">
                      <input
                        value={customerSearch}
                        onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        placeholder="Search saved customers..."
                        className="w-full rounded-2xl border border-[#dbe7ff] bg-[#f7fbff] px-4 py-2 text-sm outline-none focus:border-[#1d4ed8]"
                      />
                      {showCustomerDropdown && filteredCustomers.length > 0 && (
                        <ul className="absolute z-20 mt-1 w-full rounded-2xl border border-[#dbe7ff] bg-white shadow-lg">
                          {filteredCustomers.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => selectRepairCustomer(c)}
                                className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#eff5ff]"
                              >
                                <span className="font-medium text-[#0f1f3d]">{c.name}</span>
                                {c.whatsapp && <span className="ml-2 text-xs text-[#5f7298]">{c.whatsapp}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                </div>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Email (optional)</span>
                  <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Country code</span>
                  <select value={customerWhatsappCountryCode} onChange={(event) => setCustomerWhatsappCountryCode(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]">
                    {WHATSAPP_COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">WhatsApp number</span>
                  <input value={customerWhatsappNumber} onChange={(event) => setCustomerWhatsappNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                </label>
              </div>

              <label className="mt-4 block space-y-2 text-sm text-[#1f3563]">
                <span className="font-medium">Notes</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
              </label>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
              <h2 className="text-lg font-semibold text-[#112146]">Failures / first diagnosis</h2>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    value={failureSearch}
                    onChange={(e) => setFailureSearch(e.target.value)}
                    placeholder="Search failures..."
                    className="flex-1 rounded-2xl border border-[#dbe7ff] bg-[#f7fbff] px-4 py-2 text-sm outline-none focus:border-[#1d4ed8]"
                  />
                  {failureSearchIsNew && (
                    <button
                      type="button"
                      onClick={addCustomFailureToDb}
                      disabled={addingCustomFailure}
                      className="shrink-0 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                    >
                      {addingCustomFailure ? "Adding..." : `Add "${failureSearch.trim()}" to list`}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {filteredFailures.map((f) => (
                    <label key={f.id} className="inline-flex items-center gap-2 rounded-full bg-[#f7faff] px-4 py-2 text-sm text-[#1f3563] ring-1 ring-[#dbe7ff]">
                      <input type="checkbox" checked={selectedFailures.includes(f.name)} onChange={() => setSelectedFailures((current) => toggleValue(current, f.name))} />
                      {f.name}
                    </label>
                  ))}
                  {filteredFailures.length === 0 && failureSearch.trim() && !failureSearchIsNew && (
                    <p className="text-sm text-[#9fb3cc]">No failures match your search.</p>
                  )}
                  {typicalFailures.length === 0 && !failureSearch && (
                    <p className="text-sm text-[#9fb3cc]">No typical failures configured. Add them in Data Admin &gt; Repair Data.</p>
                  )}
                </div>
                {selectedFailures.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedFailures.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-3 py-1 text-xs font-semibold text-white">
                        {f}
                        <button type="button" onClick={() => setSelectedFailures((c) => c.filter((x) => x !== f))} className="ml-1 opacity-75 hover:opacity-100">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <label className="mt-4 block space-y-2 text-sm text-[#1f3563]">
                <span className="font-medium">Capture text</span>
                <textarea value={intakeDiagnosisText} onChange={(event) => setIntakeDiagnosisText(event.target.value)} rows={4} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
              </label>

              <label className="mt-4 block space-y-2 text-sm text-[#1f3563]">
                <span className="font-medium">Possible fix</span>
                <textarea value={possibleFixText} onChange={(event) => setPossibleFixText(event.target.value)} rows={4} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
              </label>

              <div className="mt-4 rounded-2xl bg-[#f8fbff] p-4 ring-1 ring-[#dbe7ff]">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-[#1f3563]">
                  <input type="checkbox" checked={diagnosisPending} onChange={(event) => setDiagnosisPending(event.target.checked)} />
                  Pending diagnosis
                </label>
                <label className="mt-4 block space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Total price of repair</span>
                  <input type="number" min="0" step="0.01" value={quotedTotal} disabled={diagnosisPending} onChange={(event) => setQuotedTotal(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none disabled:bg-[#eef3fb] focus:border-[#1d4ed8]" />
                </label>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
              <h2 className="text-lg font-semibold text-[#112146]">Internal use only</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Part supplier</span>
                  <select value={partsSupplierId} onChange={(event) => setPartsSupplierId(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" disabled={loadingSuppliers}>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-[#1f3563]">
                  <span className="font-medium">Parts cost</span>
                  <input type="number" min="0" step="0.01" value={partsCost} onChange={(event) => setPartsCost(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                </label>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="rounded-2xl bg-[#1d4ed8] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60">
                {submitting ? "Creating..." : "Create repair ticket"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}