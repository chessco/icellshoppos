"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { formatCurrencyDisplay } from "@/lib/display-format";
import { buildWhatsAppWebShareUrl } from "@/lib/receipt-share";
import { formatWhatsappForDisplay } from "@/lib/whatsapp";

type RepairTicket = {
  id: string;
  repairId: string;
  repairNumber: string;
  brand: string;
  model: string;
  color: string | null;
  imei: string | null;
  repairCustomerId: string | null;
  repairCustomer: { id: string; name: string; whatsapp: string | null; email: string | null } | null;
  extras: string[];
  notes: string | null;
  intakeFailures: string[];
  intakeDiagnosisText: string | null;
  possibleFixText: string | null;
  diagnosisText: string | null;
  diagnosisPending: boolean;
  quotedTotal: number | null;
  partsCost: number | null;
  stage: string;
  status: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string | null;
  partsSupplierId: string | null;
  partsSupplier: { id: string; name: string } | null;
  completedSaleId: string | null;
  completedSaleNumber: string | null;
  createdAt: string;
  updatedAt: string;
  readyForPickupAt: string | null;
  completedAt: string | null;
  parts: Array<{ id: string; name: string; quantity: number; unitCost: number | null }>;
  statusLogs: Array<{
    id: string;
    stage: string;
    status: string;
    notes: string | null;
    createdAt: string;
    changedBy: string;
  }>;
};

type Supplier = {
  id: string;
  name: string;
};

type RepairCustomer = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
};

type BrandEntry = { name: string; models: string[] };
type RepairCatalog = { brands: BrandEntry[]; colors: string[] };

const repairProgressOptions = [
  { value: "approved", label: "Approved / waiting to start" },
  { value: "disassembled", label: "Phone disassembled" },
  { value: "parts_received", label: "Parts received" },
  { value: "working", label: "Working on it" },
  { value: "testing", label: "Testing" },
];

const stageLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function RepairDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<RepairTicket | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [repairCustomers, setRepairCustomers] = useState<RepairCustomer[]>([]);
  const [catalog, setCatalog] = useState<RepairCatalog>({ brands: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [quotedTotal, setQuotedTotal] = useState("");
  const [partsSupplierId, setPartsSupplierId] = useState("");
  const [partsCost, setPartsCost] = useState("");
  const [repairStatus, setRepairStatus] = useState("approved");
  const [receiveBrand, setReceiveBrand] = useState("");
  const [receiveModel, setReceiveModel] = useState("");
  const [receiveColor, setReceiveColor] = useState("");
  const [receiveImei, setReceiveImei] = useState("");
  const [receiveCustomerName, setReceiveCustomerName] = useState("");
  const [receiveCustomerWhatsapp, setReceiveCustomerWhatsapp] = useState("");
  const [receiveCustomerEmail, setReceiveCustomerEmail] = useState("");
  const [selectedRepairCustomerId, setSelectedRepairCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const [savingReceiveDetails, setSavingReceiveDetails] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<"Cash" | "Transfer" | "Credit">("Cash");
  const [checkoutAmount, setCheckoutAmount] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [checkoutSaleNumber, setCheckoutSaleNumber] = useState("");

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/repairs/${params.id}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load repair ticket.");
      }

      setTicket(payload.ticket);
      setSuppliers(payload.suppliers ?? []);
      setRepairCustomers(payload.repairCustomers ?? []);
      setCatalog(payload.catalog ?? { brands: [], colors: [] });
      setDiagnosisText(payload.ticket.diagnosisText ?? payload.ticket.intakeDiagnosisText ?? "");
      setQuotedTotal(payload.ticket.quotedTotal === null ? "" : String(payload.ticket.quotedTotal));
      setPartsSupplierId(payload.ticket.partsSupplierId ?? "");
      setPartsCost(payload.ticket.partsCost === null ? "" : String(payload.ticket.partsCost));
      setRepairStatus(payload.ticket.status);
      setReceiveBrand(payload.ticket.brand ?? "");
      setReceiveModel(payload.ticket.model ?? "");
      setReceiveColor(payload.ticket.color ?? "");
      setReceiveImei(payload.ticket.imei ?? "");
      setReceiveCustomerName(payload.ticket.customerName ?? "");
      setReceiveCustomerWhatsapp(payload.ticket.customerWhatsapp ?? "");
      setReceiveCustomerEmail(payload.ticket.customerEmail ?? "");
      setSelectedRepairCustomerId(payload.ticket.repairCustomerId ?? "");
      setCustomerSearch(payload.ticket.repairCustomer?.name ?? payload.ticket.customerName ?? "");
      setCheckoutSaleNumber(payload.ticket.completedSaleNumber ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load repair ticket.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTicket();
  }, [params.id]);

  const diagnosisMessageText = useMemo(() => {
    if (!ticket) return "";
    const priceLabel = quotedTotal ? `Estimated total: ${formatCurrencyDisplay(Number(quotedTotal))}` : "Estimated total pending";
    return [
      `Hello ${ticket.customerName},`,
      `Repair ticket ${ticket.repairId} for your ${ticket.brand} ${ticket.model}.`,
      diagnosisText || ticket.intakeDiagnosisText || "Diagnosis update available.",
      priceLabel,
      "Please reply to approve or ask any questions.",
    ].filter(Boolean).join("\n\n");
  }, [diagnosisText, quotedTotal, ticket]);

  const filteredRepairCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return repairCustomers.slice(0, 8);
    return repairCustomers.filter((customer) =>
      [customer.name, customer.whatsapp, customer.email].some((value) => value?.toLowerCase().includes(query))
    ).slice(0, 8);
  }, [customerSearch, repairCustomers]);

  const brandOptions = catalog.brands.map((brandEntry) => brandEntry.name);
  const modelOptions = useMemo(() => {
    const found = catalog.brands.find((brandEntry) => brandEntry.name.toLowerCase() === receiveBrand.toLowerCase());
    return found?.models ?? [];
  }, [catalog.brands, receiveBrand]);

  const selectRepairCustomer = (customer: RepairCustomer) => {
    setSelectedRepairCustomerId(customer.id);
    setReceiveCustomerName(customer.name);
    setReceiveCustomerWhatsapp(customer.whatsapp ?? "");
    setReceiveCustomerEmail(customer.email ?? "");
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleReceiveDetailsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket) return;
    try {
      setSavingReceiveDetails(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateReceiveDetails",
          brand: receiveBrand,
          model: receiveModel,
          color: receiveColor,
          imei: receiveImei,
          customerName: receiveCustomerName,
          customerWhatsapp: receiveCustomerWhatsapp,
          customerEmail: receiveCustomerEmail,
          repairCustomerId: selectedRepairCustomerId || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update receive details.");
      }

      setTicket(payload.ticket);
      setStatusMessage("Receive details updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to update receive details.");
    } finally {
      setSavingReceiveDetails(false);
    }
  };

  const openWhatsappDiagnosis = () => {
    if (!ticket) return;
    const shareUrl = buildWhatsAppWebShareUrl(ticket.customerWhatsapp, diagnosisMessageText);
    if (shareUrl) {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDiagnosisSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket) return;
    try {
      setSavingDiagnosis(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveDiagnosis",
          diagnosisText,
          quotedTotal: ticket.diagnosisPending ? quotedTotal : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save diagnosis.");
      }

      setTicket(payload.ticket);
      setQuotedTotal(payload.ticket.quotedTotal === null ? "" : String(payload.ticket.quotedTotal));
      setStatusMessage("Diagnosis saved. The ticket is now waiting for approval.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save diagnosis.");
    } finally {
      setSavingDiagnosis(false);
    }
  };

  const handleApproveDiagnosis = async () => {
    if (!ticket) return;
    try {
      setSavingProgress(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approveDiagnosis" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to approve diagnosis.");
      }

      setTicket(payload.ticket);
      setRepairStatus(payload.ticket.status);
      setStatusMessage("Repair approved. The ticket is ready for active work.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to approve diagnosis.");
    } finally {
      setSavingProgress(false);
    }
  };

  const handleRepairProgressSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket) return;
    try {
      setSavingProgress(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRepairProgress",
          status: repairStatus,
          partsSupplierId: partsSupplierId || null,
          partsCost: partsCost || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update repair progress.");
      }

      setTicket(payload.ticket);
      setPartsCost(payload.ticket.partsCost === null ? "" : String(payload.ticket.partsCost));
      setStatusMessage("Repair progress updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to update repair progress.");
    } finally {
      setSavingProgress(false);
    }
  };

  const handleMarkReady = async () => {
    if (!ticket) return;
    try {
      setMarkingReady(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markReadyForPickup" }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to mark repair ready for pickup.");
      }

      setTicket(payload.ticket);
      setStatusMessage("Repair moved to Ready for pickup. Ready to process checkout.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to mark repair ready for pickup.");
    } finally {
      setMarkingReady(false);
    }
  };

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket) return;
    try {
      setProcessingCheckout(true);
      setStatusMessage("");
      setError("");

      const response = await fetch(`/api/repairs/${ticket.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: checkoutPaymentMethod,
          paymentAmount: checkoutAmount ? Number(checkoutAmount) : undefined,
          notes: checkoutNotes || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to process checkout.");
      }

      setTicket(prev => prev ? { ...prev, completedSaleId: payload.saleId, completedSaleNumber: payload.saleNumber } : null);
      setCheckoutSaleNumber(String(payload.saleNumber ?? ""));
      setStatusMessage(`Checkout completed! Sale created: ${payload.saleNumber}`);
      setCheckoutAmount("");
      setCheckoutNotes("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to process checkout.");
    } finally {
      setProcessingCheckout(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f0f6ff]">
      <AppSidebar pathname="/repairs" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {loading ? (
            <div className="rounded-3xl bg-white p-6 text-sm text-[#5a6d93] shadow-sm ring-1 ring-[#dbe7ff]">Loading repair ticket...</div>
          ) : ticket ? (
            <>
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#4c6cb3]">{ticket.repairId}</p>
                    <h1 className="mt-2 text-3xl font-semibold text-[#112146]">{ticket.brand} {ticket.model}</h1>
                    <p className="mt-2 text-sm text-[#5a6d93]">
                      {ticket.customerName} · {formatWhatsappForDisplay(ticket.customerWhatsapp)}
                      {ticket.customerEmail ? ` · ${ticket.customerEmail}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#eaf2ff] px-3 py-2 text-xs font-semibold text-[#2452ad]">{stageLabel(ticket.stage)}</span>
                    <span className="rounded-full bg-[#eef6e6] px-3 py-2 text-xs font-semibold text-[#3e6c1f]">{ticket.status.split("_").join(" ")}</span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#f8fbff] p-4 ring-1 ring-[#dbe7ff]">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#6b7fa8]">Quote</div>
                    <div className="mt-2 text-lg font-semibold text-[#112146]">
                      {ticket.quotedTotal === null ? "Pending diagnosis" : formatCurrencyDisplay(ticket.quotedTotal)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#f8fbff] p-4 ring-1 ring-[#dbe7ff]">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#6b7fa8]">Parts cost</div>
                    <div className="mt-2 text-lg font-semibold text-[#112146]">
                      {ticket.partsCost === null ? "Not set" : formatCurrencyDisplay(ticket.partsCost)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#f8fbff] p-4 ring-1 ring-[#dbe7ff]">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#6b7fa8]">Supplier</div>
                    <div className="mt-2 text-lg font-semibold text-[#112146]">{ticket.partsSupplier?.name ?? "Not assigned"}</div>
                  </div>
                </div>
              </div>

              {(error || statusMessage) && (
                <div className={[
                  "rounded-2xl bg-white p-4 text-sm font-medium shadow-sm ring-1 ring-[#dbe7ff]",
                  error ? "text-red-600" : "text-[#1d4ed8]",
                ].join(" ")}>
                  {error || statusMessage}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[1.25fr_0.85fr]">
                <div className="space-y-6">
                  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-[#112146]">Receive details</h2>
                        <p className="mt-1 text-sm text-[#5a6d93]">Edit the intake device details, customer, and saved repair-customer link.</p>
                      </div>
                    </div>

                    <form onSubmit={handleReceiveDetailsSubmit} className="mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Brand</span>
                          <input value={receiveBrand} onChange={(event) => setReceiveBrand(event.target.value)} list="repair-brands" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                          {brandOptions.length > 0 && (
                            <datalist id="repair-brands">
                              {brandOptions.map((brand) => <option key={brand} value={brand} />)}
                            </datalist>
                          )}
                        </label>
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Model</span>
                          <input value={receiveModel} onChange={(event) => setReceiveModel(event.target.value)} list="repair-models" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                          {modelOptions.length > 0 && (
                            <datalist id="repair-models">
                              {modelOptions.map((model) => <option key={model} value={model} />)}
                            </datalist>
                          )}
                        </label>
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Color</span>
                          <input value={receiveColor} onChange={(event) => setReceiveColor(event.target.value)} list="repair-colors" className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                          {catalog.colors.length > 0 && (
                            <datalist id="repair-colors">
                              {catalog.colors.map((color) => <option key={color} value={color} />)}
                            </datalist>
                          )}
                        </label>
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">IMEI</span>
                          <input value={receiveImei} onChange={(event) => setReceiveImei(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div ref={customerSearchRef} className="relative space-y-2 text-sm text-[#1f3563] md:col-span-2">
                          <span className="font-medium">Repair customer lookup</span>
                          <input
                            value={customerSearch}
                            onChange={(event) => { setCustomerSearch(event.target.value); setShowCustomerDropdown(true); }}
                            onFocus={() => setShowCustomerDropdown(true)}
                            placeholder="Search saved repair customers..."
                            className="w-full rounded-2xl border border-[#dbe7ff] bg-[#f7fbff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                          />
                          {showCustomerDropdown && filteredRepairCustomers.length > 0 && (
                            <ul className="absolute z-20 mt-1 w-full rounded-2xl border border-[#dbe7ff] bg-white shadow-lg">
                              {filteredRepairCustomers.map((customer) => (
                                <li key={customer.id}>
                                  <button type="button" onClick={() => selectRepairCustomer(customer)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#eff5ff]">
                                    <span className="font-medium text-[#0f1f3d]">{customer.name}</span>
                                    {customer.whatsapp && <span className="ml-2 text-xs text-[#5f7298]">{customer.whatsapp}</span>}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="text-xs text-[#6b7fa8]">Selecting a saved repair customer fills name, WhatsApp, and email.</p>
                        </div>

                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Customer name</span>
                          <input value={receiveCustomerName} onChange={(event) => setReceiveCustomerName(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                        </label>
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">WhatsApp</span>
                          <input value={receiveCustomerWhatsapp} onChange={(event) => setReceiveCustomerWhatsapp(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" required />
                        </label>
                        <label className="space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Email</span>
                          <input type="email" value={receiveCustomerEmail} onChange={(event) => setReceiveCustomerEmail(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <button type="submit" disabled={savingReceiveDetails} className="rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60">
                          {savingReceiveDetails ? "Saving..." : "Save receive details"}
                        </button>
                        {ticket.repairCustomer && (
                          <span className="text-sm text-[#5a6d93]">
                            Linked repair customer: <span className="font-semibold text-[#2452ad]">{ticket.repairCustomer.name}</span>
                          </span>
                        )}
                      </div>
                    </form>

                    <div className="mt-6 grid gap-4 text-sm text-[#1f3563] md:grid-cols-2">
                      <div>
                        <dt className="font-medium text-[#6b7fa8]">Extras</dt>
                        <dd className="mt-1">{ticket.extras.length > 0 ? ticket.extras.join(", ") : "None"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[#6b7fa8]">Failures</dt>
                        <dd className="mt-1">{ticket.intakeFailures.length > 0 ? ticket.intakeFailures.join(", ") : "None captured"}</dd>
                      </div>
                      {ticket.notes && (
                        <div className="md:col-span-2 rounded-2xl bg-[#f8fbff] p-4 text-sm text-[#1f3563] ring-1 ring-[#dbe7ff]">
                          <div className="font-medium text-[#6b7fa8]">Notes</div>
                          <p className="mt-2 whitespace-pre-wrap">{ticket.notes}</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-[#112146]">Diagnosis</h2>
                        <p className="mt-1 text-sm text-[#5a6d93]">
                          Save the formal diagnosis, set the price when it was pending at intake, and share it with the customer on WhatsApp.
                        </p>
                      </div>
                      <button type="button" onClick={openWhatsappDiagnosis} className="rounded-2xl border border-[#cfe0ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff5ff]">
                        Send diagnosis via WhatsApp
                      </button>
                    </div>

                    <form onSubmit={handleDiagnosisSubmit} className="mt-4 space-y-4">
                      <label className="block space-y-2 text-sm text-[#1f3563]">
                        <span className="font-medium">Diagnosis text</span>
                        <textarea value={diagnosisText} onChange={(event) => setDiagnosisText(event.target.value)} rows={5} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                      </label>

                      <label className="block space-y-2 text-sm text-[#1f3563]">
                        <span className="font-medium">Total price of repair</span>
                        <input type="number" min="0" step="0.01" value={quotedTotal} disabled={!ticket.diagnosisPending} onChange={(event) => setQuotedTotal(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none disabled:bg-[#eef3fb] focus:border-[#1d4ed8]" />
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={savingDiagnosis} className="rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60">
                          {savingDiagnosis ? "Saving..." : "Save diagnosis"}
                        </button>
                        <button type="button" disabled={savingProgress || ticket.status === "approved" || ticket.stage === "repairing" || ticket.stage === "ready_for_pickup"} onClick={handleApproveDiagnosis} className="rounded-2xl border border-[#cfe0ff] px-5 py-3 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff] disabled:opacity-60">
                          Mark approved
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                    <h2 className="text-lg font-semibold text-[#112146]">Repairing</h2>
                    <p className="mt-1 text-sm text-[#5a6d93]">
                      Capture supplier and parts cost, then advance the internal repair status. Active work requires parts cost.
                    </p>

                    <form onSubmit={handleRepairProgressSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2 text-sm text-[#1f3563] md:col-span-1">
                        <span className="font-medium">Part supplier</span>
                        <select value={partsSupplierId} onChange={(event) => setPartsSupplierId(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]">
                          <option value="">Select supplier</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2 text-sm text-[#1f3563] md:col-span-1">
                        <span className="font-medium">Parts cost</span>
                        <input type="number" min="0" step="0.01" value={partsCost} onChange={(event) => setPartsCost(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]" />
                      </label>
                      <label className="space-y-2 text-sm text-[#1f3563] md:col-span-2">
                        <span className="font-medium">Repair status</span>
                        <select value={repairStatus} onChange={(event) => setRepairStatus(event.target.value)} className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]">
                          {repairProgressOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="md:col-span-2 flex flex-wrap gap-3">
                        <button type="submit" disabled={savingProgress} className="rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60">
                          {savingProgress ? "Saving..." : "Save repair progress"}
                        </button>
                        <button type="button" onClick={handleMarkReady} disabled={markingReady || ticket.stage === "ready_for_pickup"} className="rounded-2xl border border-[#cfe0ff] px-5 py-3 text-sm font-semibold text-[#1d4ed8] transition hover:bg-[#eff5ff] disabled:opacity-60">
                          {markingReady ? "Updating..." : "Ready for pickup"}
                        </button>
                      </div>
                    </form>
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                    <h2 className="text-lg font-semibold text-[#112146]">Ticket timeline</h2>
                    <div className="mt-4 space-y-4">
                      {ticket.statusLogs.map((log) => (
                        <div key={log.id} className="rounded-2xl bg-[#f8fbff] p-4 ring-1 ring-[#dbe7ff]">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-semibold text-[#1f3563]">{stageLabel(log.stage)} · {log.status.split("_").join(" ")}</span>
                            <span className="text-xs text-[#6b7fa8]">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-2 text-xs text-[#6b7fa8]">By {log.changedBy}</p>
                          {log.notes && <p className="mt-2 text-sm text-[#1f3563]">{log.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dbe7ff]">
                    <h2 className="text-lg font-semibold text-[#112146]">Pickup checkout</h2>
                    <div className="mt-4 space-y-3 text-sm text-[#1f3563]">
                      <p>Ready for pickup at: {ticket.readyForPickupAt ? new Date(ticket.readyForPickupAt).toLocaleString() : "Not yet"}</p>
                      <p>Linked sale: {(checkoutSaleNumber || ticket.completedSaleNumber) ? (
                        <span className="font-semibold text-[#2452ad]">{checkoutSaleNumber || ticket.completedSaleNumber}</span>
                      ) : (
                        <span className="text-[#6b7fa8]">Not yet</span>
                      )}</p>
                      {(checkoutSaleNumber || ticket.completedSaleNumber) && (
                        <Link
                          href={`/sales/history?search=${encodeURIComponent(checkoutSaleNumber || ticket.completedSaleNumber || "")}`}
                          className="inline-flex rounded-2xl border border-[#cfe0ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff5ff]"
                        >
                          Open in Sales History
                        </Link>
                      )}
                    </div>

                    {!ticket.completedSaleId && ticket.stage === "ready_for_pickup" && (
                      <form onSubmit={handleCheckout} className="mt-6 space-y-4 border-t border-[#dbe7ff] pt-4">
                        <label className="block space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Payment method</span>
                          <select
                            value={checkoutPaymentMethod}
                            onChange={(event) => setCheckoutPaymentMethod(event.target.value as "Cash" | "Transfer" | "Credit")}
                            className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                          >
                            <option value="Cash">Cash</option>
                            <option value="Transfer">Transfer</option>
                            <option value="Credit">Credit</option>
                          </select>
                        </label>
                        <label className="block space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Amount (optional override)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={checkoutAmount}
                            onChange={(event) => setCheckoutAmount(event.target.value)}
                            placeholder={ticket.quotedTotal ? formatCurrencyDisplay(ticket.quotedTotal) : "Auto: Quoted total"}
                            className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                          />
                        </label>
                        <label className="block space-y-2 text-sm text-[#1f3563]">
                          <span className="font-medium">Notes</span>
                          <textarea
                            value={checkoutNotes}
                            onChange={(event) => setCheckoutNotes(event.target.value)}
                            placeholder="Optional notes for this checkout"
                            rows={2}
                            className="w-full rounded-2xl border border-[#dbe7ff] px-4 py-3 outline-none focus:border-[#1d4ed8]"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={processingCheckout}
                          className="w-full rounded-2xl bg-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:opacity-60"
                        >
                          {processingCheckout ? "Processing..." : `Complete Pickup (${ticket.quotedTotal ? formatCurrencyDisplay(ticket.quotedTotal) : "Amount TBD"})`}
                        </button>
                      </form>
                    )}
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl bg-white p-6 text-sm text-red-600 shadow-sm ring-1 ring-[#dbe7ff]">{error || "Repair ticket not found."}</div>
          )}
        </div>
      </main>
    </div>
  );
}