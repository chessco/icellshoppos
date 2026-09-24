"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";
import { formatCurrencyDisplay } from "@/lib/display-format";
import type { AuthorizationSnapshot } from "@/lib/discount-authorization";

type DiscountAuthorizationRecord = {
  id: string;
  organizationId: string;
  draftSaleId: string;
  completedSaleId?: string | null;
  requestedByUserId: string;
  authorizedByUserId?: string | null;
  status: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "CANCELLED";
  requestedDiscount: string | number;
  approvedDiscount: string | number;
  reason: string;
  responseNote?: string | null;
  snapshotJson: AuthorizationSnapshot;
  createdAt: string;
  respondedAt?: string | null;
  requestedBy?: {
    id: string;
    fullName?: string | null;
    email: string;
  };
  authorizedBy?: {
    id: string;
    fullName?: string | null;
    email: string;
  };
};

const parseMoney = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => formatCurrencyDisplay(Math.round(value));

export default function DiscountAuthorizationsPage() {
  const pathname = usePathname();
  const [authorizations, setAuthorizations] = useState<DiscountAuthorizationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED">("PENDING");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Partial approval modal state
  const [partialModalAuth, setPartialModalAuth] = useState<DiscountAuthorizationRecord | null>(null);
  const [partialAmountInput, setPartialAmountInput] = useState("");
  const [partialNoteInput, setPartialNoteInput] = useState("");

  // Reject modal state
  const [rejectModalAuth, setRejectModalAuth] = useState<DiscountAuthorizationRecord | null>(null);
  const [rejectNoteInput, setRejectNoteInput] = useState("");

  // User permission check
  const [canApprove, setCanApprove] = useState(false);
  const [canViewCost, setCanViewCost] = useState(false);

  const fetchAuthStatusAndData = async () => {
    try {
      setLoading(true);
      const [authRes, dataRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/sales/authorizations", { cache: "no-store" }),
      ]);

      if (authRes.ok) {
        const authData = await authRes.json().catch(() => ({}));
        const isSuper = Boolean(authData?.session?.isSuperadmin);
        const role = authData?.role || authData?.session?.role;
        const hasApprovePerm = authData?.permissions?.canApproveDiscounts === true;
        const hasCostPerm = authData?.permissions?.canViewCostAndMargin === true;
        setCanApprove(isSuper || role === "superadmin" || role === "admin" || hasApprovePerm);
        setCanViewCost(isSuper || role === "superadmin" || role === "admin" || hasCostPerm);
      }

      if (dataRes.ok) {
        const payload = await dataRes.json();
        setAuthorizations(payload.authorizations || []);
      } else {
        setErrorMessage("No se pudieron cargar las autorizaciones.");
      }
    } catch {
      setErrorMessage("Error de conexión al cargar datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthStatusAndData();
  }, []);

  const counts = useMemo(() => {
    return {
      all: authorizations.length,
      pending: authorizations.filter((a) => a.status === "PENDING").length,
      approved: authorizations.filter((a) => a.status === "APPROVED").length,
      partial: authorizations.filter((a) => a.status === "PARTIAL").length,
      rejected: authorizations.filter((a) => a.status === "REJECTED").length,
    };
  }, [authorizations]);

  const filteredAuthorizations = useMemo(() => {
    if (activeTab === "ALL") return authorizations;
    return authorizations.filter((a) => a.status === activeTab);
  }, [authorizations, activeTab]);

  const handleApproveFull = async (auth: DiscountAuthorizationRecord) => {
    const requested = parseMoney(auth.requestedDiscount);
    if (!window.confirm(`¿Aprobar el 100% del descuento solicitado (${money(requested)}) para la venta ${auth.draftSaleId}?`)) {
      return;
    }

    try {
      setActionLoadingId(auth.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/sales/authorizations/${auth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "No se pudo aprobar la solicitud.");
        return;
      }

      setSuccessMessage(`Solicitud para venta ${auth.draftSaleId} aprobada por ${money(requested)}.`);
      await fetchAuthStatusAndData();
    } catch {
      setErrorMessage("Error al procesar la aprobación.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenPartialModal = (auth: DiscountAuthorizationRecord) => {
    const requested = parseMoney(auth.requestedDiscount);
    setPartialModalAuth(auth);
    setPartialAmountInput(String(Math.round(requested / 2)));
    setPartialNoteInput("");
  };

  const submitPartialApproval = async () => {
    if (!partialModalAuth) return;
    const partialAmount = parseMoney(partialAmountInput);
    const requested = parseMoney(partialModalAuth.requestedDiscount);

    if (partialAmount <= 0) {
      alert("El monto debe ser mayor a $0.");
      return;
    }
    if (partialAmount >= requested) {
      alert(`El monto parcial debe ser menor al solicitado (${money(requested)}).`);
      return;
    }

    try {
      setActionLoadingId(partialModalAuth.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/sales/authorizations/${partialModalAuth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE_PARTIAL",
          partialAmount,
          responseNote: partialNoteInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "No se pudo aprobar parcialmente la solicitud.");
        return;
      }

      setSuccessMessage(
        `Descuento parcial aprobado por ${money(partialAmount)} (solicitado: ${money(requested)}) para la venta ${partialModalAuth.draftSaleId}.`
      );
      setPartialModalAuth(null);
      await fetchAuthStatusAndData();
    } catch {
      setErrorMessage("Error al procesar la aprobación parcial.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenRejectModal = (auth: DiscountAuthorizationRecord) => {
    setRejectModalAuth(auth);
    setRejectNoteInput("");
  };

  const submitReject = async () => {
    if (!rejectModalAuth) return;

    try {
      setActionLoadingId(rejectModalAuth.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/sales/authorizations/${rejectModalAuth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          responseNote: rejectNoteInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "No se pudo rechazar la solicitud.");
        return;
      }

      setSuccessMessage(`Solicitud de descuento para la venta ${rejectModalAuth.draftSaleId} rechazada.`);
      setRejectModalAuth(null);
      await fetchAuthStatusAndData();
    } catch {
      setErrorMessage("Error al rechazar la solicitud.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: DiscountAuthorizationRecord["status"]) => {
    switch (status) {
      case "PENDING":
        return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-300">Pendiente de Autorización</span>;
      case "APPROVED":
        return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">Aprobado Total</span>;
      case "PARTIAL":
        return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-300">Aprobación Parcial</span>;
      case "REJECTED":
        return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800 border border-red-300">Rechazado</span>;
      case "CANCELLED":
        return <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700 border border-gray-300">Cancelado</span>;
      default:
        return <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#5c4332]">
          <CurrentOrgBadge />
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />

        <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:gap-6 md:px-6 md:py-10">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f1a16] md:text-3xl">
                Autorizaciones de Descuentos
              </h1>
              <p className="text-sm text-[#6a4d3a]">
                Panel de revisión y aprobación de descuentos en mostrador e iPad.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={fetchAuthStatusAndData}
                disabled={loading}
                className="rounded-full border border-[#d6c1ad] bg-[#fffaf3] px-4 py-2 text-sm font-medium text-[#3b2a1e] hover:bg-[#f3eee6] disabled:opacity-60 transition shadow-sm"
              >
                {loading ? "Actualizando..." : "↻ Actualizar"}
              </button>
            </div>
          </header>

          {/* Notifications */}
          {errorMessage && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
              {successMessage}
            </div>
          )}

          {!canApprove && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <strong>Modo Consulta (Staff):</strong> Puedes ver el estado de las solicitudes generadas. Solo usuarios con permiso de autorización (Administradores / Superadmins) pueden responder a las solicitudes pendientes.
            </div>
          )}

          {/* Filter Tabs Card */}
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-3 shadow-sm md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("PENDING")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    activeTab === "PENDING"
                      ? "bg-[#1f1a16] text-white shadow-sm"
                      : "bg-[#fffaf3] text-[#5c4332] border border-[#e6d6c6] hover:bg-[#fff6ea]"
                  }`}
                >
                  Pendientes ({counts.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("APPROVED")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    activeTab === "APPROVED"
                      ? "bg-[#1f1a16] text-white shadow-sm"
                      : "bg-[#fffaf3] text-[#5c4332] border border-[#e6d6c6] hover:bg-[#fff6ea]"
                  }`}
                >
                  Aprobadas ({counts.approved})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("PARTIAL")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    activeTab === "PARTIAL"
                      ? "bg-[#1f1a16] text-white shadow-sm"
                      : "bg-[#fffaf3] text-[#5c4332] border border-[#e6d6c6] hover:bg-[#fff6ea]"
                  }`}
                >
                  Parciales ({counts.partial})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("REJECTED")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    activeTab === "REJECTED"
                      ? "bg-[#1f1a16] text-white shadow-sm"
                      : "bg-[#fffaf3] text-[#5c4332] border border-[#e6d6c6] hover:bg-[#fff6ea]"
                  }`}
                >
                  Rechazadas ({counts.rejected})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ALL")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    activeTab === "ALL"
                      ? "bg-[#1f1a16] text-white shadow-sm"
                      : "bg-[#fffaf3] text-[#5c4332] border border-[#e6d6c6] hover:bg-[#fff6ea]"
                  }`}
                >
                  Todas ({counts.all})
                </button>
              </div>

              <div className="text-xs text-[#6a4d3a]">
                Mostrando <strong className="text-[#1f1a16]">{filteredAuthorizations.length}</strong> solicitudes
              </div>
            </div>
          </section>

          {/* Cards List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[#e6d6c6] bg-white p-12 text-center shadow-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1f1a16] border-t-transparent mb-3" />
              <p className="text-sm font-medium text-[#6a4d3a]">Cargando solicitudes de autorización...</p>
            </div>
          ) : filteredAuthorizations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d6c1ad] bg-white/70 p-12 text-center text-[#6a4d3a] shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff4ea] text-2xl mb-3">
                🏷️
              </div>
              <p className="text-base font-semibold text-[#1f1a16]">No hay solicitudes con el filtro seleccionado</p>
              <p className="mt-1 text-xs text-[#6a4d3a]">
                No se encontraron solicitudes en estado "{activeTab === "ALL" ? "Todas" : activeTab.toLowerCase()}".
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredAuthorizations.map((auth) => {
                const snapshot = auth.snapshotJson;
                const requested = parseMoney(auth.requestedDiscount);
                const approved = parseMoney(auth.approvedDiscount);
                const isPending = auth.status === "PENDING";
                const isBusy = actionLoadingId === auth.id;

                return (
                  <div
                    key={auth.id}
                    className="overflow-hidden rounded-2xl border border-[#e6d6c6] bg-white shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1e4d6] bg-[#fffaf3] px-5 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm font-bold text-[#1f1a16]">
                          Venta: {auth.draftSaleId}
                        </span>
                        {getStatusBadge(auth.status)}
                        {auth.completedSaleId && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            Venta Concretada
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#6a4d3a]">
                        Fecha: {new Date(auth.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        {/* Cliente */}
                        <div className="rounded-xl border border-[#ead8c6] bg-[#fffcf8] p-3 text-xs">
                          <p className="font-bold uppercase tracking-wider text-[#6a4d3a]">Cliente</p>
                          <p className="mt-1 text-sm font-semibold text-[#1f1a16]">
                            {snapshot?.customer?.name || "Sin nombre"}
                          </p>
                          {snapshot?.customer?.whatsapp && (
                            <p className="text-[#5c4332]">WhatsApp: {snapshot.customer.whatsapp}</p>
                          )}
                          {snapshot?.customer?.email && (
                            <p className="text-[#5c4332]">Email: {snapshot.customer.email}</p>
                          )}
                        </div>

                        {/* Vendedor */}
                        <div className="rounded-xl border border-[#ead8c6] bg-[#fffcf8] p-3 text-xs">
                          <p className="font-bold uppercase tracking-wider text-[#6a4d3a]">Vendedor / Staff</p>
                          <p className="mt-1 text-sm font-semibold text-[#1f1a16]">
                            {auth.requestedBy?.fullName || snapshot?.seller?.name || "Staff"}
                          </p>
                          <p className="text-[#5c4332]">
                            {auth.requestedBy?.email || snapshot?.seller?.email || ""}
                          </p>
                        </div>

                        {/* Resumen Descuento */}
                        <div className="rounded-xl border border-[#ead8c6] bg-[#fffcf8] p-3 text-xs">
                          <p className="font-bold uppercase tracking-wider text-[#6a4d3a]">Descuento</p>
                          <p className="mt-1 text-sm font-semibold text-[#b91c1c]">
                            Solicitado: {money(requested)}
                          </p>
                          {(auth.status === "APPROVED" || auth.status === "PARTIAL") && (
                            <p className="text-sm font-bold text-emerald-700">
                              Autorizado: {money(approved)}
                            </p>
                          )}
                          {auth.status === "REJECTED" && (
                            <p className="text-xs font-semibold text-red-700">Autorizado: $0 (Rechazado)</p>
                          )}
                        </div>
                      </div>

                      {/* Motivo */}
                      <div className="mt-4 rounded-xl border border-[#ead8c6] bg-[#fffcf8] p-3 text-xs">
                        <p className="font-bold uppercase tracking-wider text-[#6a4d3a]">Motivo de la Solicitud</p>
                        <p className="mt-1 text-sm text-[#3b2a1e] italic">"{auth.reason}"</p>
                      </div>

                      {/* Nota de respuesta si existe */}
                      {auth.responseNote && (
                        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs">
                          <p className="font-bold uppercase tracking-wider text-blue-900">
                            Respuesta del Autorizador ({auth.authorizedBy?.fullName || "Admin"} - {auth.respondedAt ? new Date(auth.respondedAt).toLocaleString() : ""})
                          </p>
                          <p className="mt-1 text-sm text-blue-950 font-medium">{auth.responseNote}</p>
                        </div>
                      )}

                      {/* Equipos y Finanzas (FASE 3) */}
                      <div className="mt-5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                          Equipos en la Venta ({snapshot?.items?.length || 0})
                        </h3>
                        <div className="mt-2 overflow-x-auto rounded-xl border border-[#ead8c6]">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-[#f9f5f0] text-[#6a4d3a]">
                              <tr>
                                <th className="px-3 py-2">IMEI / Serie</th>
                                <th className="px-3 py-2">Modelo</th>
                                <th className="px-3 py-2">Capacidad / Color</th>
                                {canViewCost && <th className="px-3 py-2 text-right">Costo</th>}
                                <th className="px-3 py-2 text-right">Precio de Lista</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f1e4d6]">
                              {(snapshot?.items || []).map((item, idx) => (
                                <tr key={idx} className="hover:bg-[#fffaf3]">
                                  <td className="px-3 py-2 font-mono font-medium">{item.imei || item.serialNumber || "-"}</td>
                                  <td className="px-3 py-2 font-semibold">{item.model}</td>
                                  <td className="px-3 py-2">{item.capacity} {item.color}</td>
                                  {canViewCost && <td className="px-3 py-2 text-right text-[#5c4332]">{money(item.costPesos)}</td>}
                                  <td className="px-3 py-2 text-right font-semibold text-[#1f1a16]">{money(item.salePrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Indicadores Financieros y Márgenes (FASE 3 & FASE 7) */}
                      {snapshot?.financials && (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-[#ead8c6] bg-[#fdf8f2] p-4 text-xs">
                          <div>
                            <span className="text-[#6a4d3a]">Precio de Lista Total:</span>
                            <p className="text-sm font-bold text-[#1f1a16]">{money(snapshot.financials.originalPrice)}</p>
                          </div>
                          <div>
                            <span className="text-[#6a4d3a]">Tras Descuento Solicitado:</span>
                            <p className="text-sm font-bold text-[#b91c1c]">{money(snapshot.financials.priceAfterRequestedDiscount)}</p>
                          </div>
                          {canViewCost && (
                            <>
                              <div>
                                <span className="text-[#6a4d3a]">Margen Antes:</span>
                                <p className="text-sm font-bold text-emerald-700">
                                  {money(snapshot.financials.marginBeforeDiscount)} ({snapshot.financials.marginPercentageBeforeDiscount}%)
                                </p>
                              </div>
                              <div>
                                <span className="text-[#6a4d3a]">Margen Solicitado:</span>
                                <p className={`text-sm font-bold ${snapshot.financials.marginAfterRequestedDiscount < 0 ? "text-red-700" : "text-emerald-700"}`}>
                                  {money(snapshot.financials.marginAfterRequestedDiscount)} ({snapshot.financials.marginPercentageAfterRequestedDiscount}%)
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Acciones para el autorizador (FASE 5) */}
                      {isPending && canApprove && (
                        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[#f1e4d6] pt-4">
                          <button
                            type="button"
                            onClick={() => handleOpenRejectModal(auth)}
                            disabled={isBusy}
                            className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            Rechazar ($0)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPartialModal(auth)}
                            disabled={isBusy}
                            className="rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            Aprobar Monto Menor...
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveFull(auth)}
                            disabled={isBusy}
                            className="rounded-full bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {isBusy ? "Procesando..." : `Aprobar Total (${money(requested)})`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Modal Aprobación Parcial */}
      {partialModalAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1f1a16]">Aprobación Parcial de Descuento</h3>
            <p className="mt-1 text-xs text-[#6a4d3a]">
              Venta: <span className="font-semibold">{partialModalAuth.draftSaleId}</span> | Descuento solicitado: <span className="font-bold text-[#b91c1c]">{money(parseMoney(partialModalAuth.requestedDiscount))}</span>
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                Monto a Autorizar ($ MXN)
              </label>
              <input
                type="number"
                min="1"
                max={parseMoney(partialModalAuth.requestedDiscount) - 1}
                value={partialAmountInput}
                onChange={(e) => setPartialAmountInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-base font-bold outline-none focus:border-[#1f1a16]"
              />
              <p className="mt-1 text-[11px] text-[#6a4d3a]">
                Debe ser mayor a $0 y menor a {money(parseMoney(partialModalAuth.requestedDiscount))}.
              </p>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                Nota / Comentario de Respuesta (Opcional)
              </label>
              <textarea
                rows={2}
                value={partialNoteInput}
                onChange={(e) => setPartialNoteInput(e.target.value)}
                placeholder="Ej. Solo puedo autorizar $300 por margen comercial..."
                className="mt-1 w-full rounded-xl border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-xs outline-none focus:border-[#1f1a16]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPartialModalAuth(null)}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-xs font-semibold text-[#5c4332]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitPartialApproval}
                disabled={actionLoadingId === partialModalAuth.id}
                className="rounded-full bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                Confirmar Autorización Parcial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rechazo */}
      {rejectModalAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-red-800">Rechazar Descuento</h3>
            <p className="mt-1 text-xs text-[#6a4d3a]">
              Se autorizará $0 de descuento para la venta <span className="font-semibold">{rejectModalAuth.draftSaleId}</span>.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6a4d3a]">
                Motivo del Rechazo (Opcional)
              </label>
              <textarea
                rows={3}
                value={rejectNoteInput}
                onChange={(e) => setRejectNoteInput(e.target.value)}
                placeholder="Ej. El margen del producto no permite descuento adicional en esta ocasión..."
                className="mt-1 w-full rounded-xl border border-[#d6c1ad] bg-[#fffaf3] px-3 py-2 text-xs outline-none focus:border-[#1f1a16]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectModalAuth(null)}
                className="rounded-full border border-[#d6c1ad] px-4 py-2 text-xs font-semibold text-[#5c4332]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={actionLoadingId === rejectModalAuth.id}
                className="rounded-full bg-red-700 px-5 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
