"use client";

import React, { useState, useEffect } from "react";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({
    whatsapp_provider: "PITAYACORE",
    pitayacore_api_url: "https://pitayacore-api.pitayacode.io/api",
    pitayacore_api_key: "",
    pitayacore_tenant_id: "",
    pitayacore_agent_slug: "icellshop-autorizaciones",
    pitayacore_authorizer_phone: "",
    pitayacore_webhook_secret: "",
    flow_api_url: "https://flow-api.pitayacode.io",
    flow_internal_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings/integrations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      }
    } catch (err) {
      console.error("Error fetching integration settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Error al guardar las configuraciones de integración");
      }
    } catch (err) {
      console.error("Error saving integration settings:", err);
      alert("Error de conexión al guardar configuraciones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Top Navbar with CurrentOrgBadge & Luxury Header Actions */}
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(244,248,255,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#0f1f3d]">
          <div className="flex items-center gap-3">
            <CurrentOrgBadge />
            <span className="h-4 w-px bg-slate-300 hidden md:block" />
            <span className="font-semibold text-xs uppercase tracking-widest text-slate-500 hidden md:block">
              Ajustes & Integraciones
            </span>
          </div>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname="/settings/integrations" />

        <main className="min-w-0 p-6 md:p-10 max-w-5xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <div className="size-10 rounded-full border-3 border-[#2563eb] border-t-transparent animate-spin" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargando integraciones...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {/* Header Title & Subtitle */}
              <div>
                <h1 className="text-[#0f1f3d] text-3xl md:text-4xl font-black tracking-tight font-display">
                  Integraciones
                </h1>
                <p className="text-slate-500 text-sm font-medium mt-2">
                  Conecte el sistema POS con herramientas y pasarelas externas para potenciar su flujo de trabajo.
                </p>
              </div>

              {/* Integration Card: WHATSAPP BOT */}
              <div className="group relative overflow-hidden p-8 md:p-10 rounded-[36px] bg-white border border-[#c7dcff] shadow-sm">
                {/* Top Right Floating Bot Icon */}
                <div className="absolute top-8 right-8 hidden sm:flex">
                  <div className="size-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                    <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                    </svg>
                  </div>
                </div>

                <div className="max-w-2xl w-full">
                  <h2 className="text-2xl font-black uppercase tracking-wider text-[#0f1f3d] mb-2">
                    WhatsApp Bot
                  </h2>
                  <p className="text-slate-600 text-sm font-medium mb-8 leading-relaxed">
                    Automatice las notificaciones de ventas, turnos y recordatorios al WhatsApp de sus clientes seleccionando entre la integración oficial o una API externa basada en una librería JS.
                  </p>

                  <form onSubmit={handleSave} className="space-y-6">
                    {/* Provider Toggle Tabs */}
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Proveedor de WhatsApp Activo
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "FLOW" }))}
                          className={`py-3.5 px-4 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all ${
                            settings.whatsapp_provider === "FLOW"
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-indigo-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          Meta Oficial (Flow)
                        </button>

                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "PITAYACORE" }))}
                          className={`py-3.5 px-4 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all ${
                            settings.whatsapp_provider === "PITAYACORE"
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-indigo-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          Librería JS (PitayaCore)
                        </button>

                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "LINKS" }))}
                          className={`py-3.5 px-4 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all ${
                            settings.whatsapp_provider === "LINKS"
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-emerald-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          🔗 Links (WA Web)
                        </button>
                      </div>
                    </div>

                    {/* PROVIDER: PITAYACORE FIELDS */}
                    {settings.whatsapp_provider === "PITAYACORE" && (
                      <div className="space-y-4 pt-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            PitayaCore API URL
                          </label>
                          <input
                            type="text"
                            value={settings.pitayacore_api_url || ""}
                            onChange={(e) => setSettings({ ...settings, pitayacore_api_url: e.target.value })}
                            placeholder="https://pitayacore-api.pitayacode.io/api"
                            className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            PitayaCore API Key (Connection Token)
                          </label>
                          <div className="relative">
                            <input
                              type={showApiKey ? "text" : "password"}
                              value={settings.pitayacore_api_key || ""}
                              onChange={(e) => setSettings({ ...settings, pitayacore_api_key: e.target.value })}
                              placeholder="••••••••••••••••••••••••"
                              className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 pr-12 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              title="Mostrar / Ocultar Token"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Tenant ID de CRED en PitayaCore
                          </label>
                          <input
                            type="text"
                            value={settings.pitayacore_tenant_id || ""}
                            onChange={(e) => setSettings({ ...settings, pitayacore_tenant_id: e.target.value })}
                            placeholder="ej. 87e0dd95-fd29-4e63-a219-18478c58e4c8"
                            className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                          />
                        </div>

                        {/* Separador de sección — Autorizaciones */}
                        <div className="border-t border-[#e8f0ff] pt-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-4">
                            🔐 Autorizaciones de Descuentos
                          </p>

                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Agente PitayaCore (Slug)
                              </label>
                              <input
                                type="text"
                                value={settings.pitayacore_agent_slug || ""}
                                onChange={(e) => setSettings({ ...settings, pitayacore_agent_slug: e.target.value })}
                                placeholder="icellshop-autorizaciones"
                                className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                              />
                              <p className="text-[10px] text-slate-400 px-1">
                                Slug del agente coordinador de autorizaciones en PitayaCore.
                              </p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                WhatsApp del Autorizador
                              </label>
                              <input
                                type="text"
                                value={settings.pitayacore_authorizer_phone || ""}
                                onChange={(e) => setSettings({ ...settings, pitayacore_authorizer_phone: e.target.value })}
                                placeholder="5212223334455"
                                className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                              />
                              <p className="text-[10px] text-slate-400 px-1">
                                Número WhatsApp del autorizador que recibirá las solicitudes de descuento (con código de país, sin +).
                              </p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Webhook Secret
                              </label>
                              <input
                                type="password"
                                value={settings.pitayacore_webhook_secret || ""}
                                onChange={(e) => setSettings({ ...settings, pitayacore_webhook_secret: e.target.value })}
                                placeholder="••••••••••••••••••••"
                                className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                              />
                              <p className="text-[10px] text-slate-400 px-1">
                                Secret compartido con PitayaCore para verificar autenticidad de los webhooks de autorización. Configura el mismo valor en PitayaCore.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PROVIDER: FLOW FIELDS */}
                    {settings.whatsapp_provider === "FLOW" && (
                      <div className="space-y-4 pt-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Flow API URL
                          </label>
                          <input
                            type="text"
                            value={settings.flow_api_url || ""}
                            onChange={(e) => setSettings({ ...settings, flow_api_url: e.target.value })}
                            placeholder="https://flow-api.pitayacode.io"
                            className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Internal API Key
                          </label>
                          <input
                            type="password"
                            value={settings.flow_internal_key || ""}
                            onChange={(e) => setSettings({ ...settings, flow_internal_key: e.target.value })}
                            placeholder="••••••••••••••••"
                            className="w-full bg-[#f8fbff] border border-[#c7dcff] rounded-2xl px-5 py-3.5 text-xs text-[#0f1f3d] font-mono outline-none focus:border-indigo-600 transition-all"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROVIDER: LINKS INFO */}
                    {settings.whatsapp_provider === "LINKS" && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#0f1f3d]">
                              WhatsApp Web — Sin configuración requerida
                            </p>
                            <p className="text-xs text-slate-500 font-medium">
                              No necesita servidor ni credenciales API. Los mensajes se abren directamente mediante enlaces wa.me.
                            </p>
                          </div>
                        </div>

                        <ul className="space-y-2 text-xs text-slate-700 border-t border-emerald-200/50 pt-3">
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Botón "WA App":</strong> Abre WhatsApp nativo en computadoras y tabletas.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Botón "WA Web":</strong> Abre web.whatsapp.com en una pestaña nueva.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Prefijo México +52:</strong> Normaliza números de 10 dígitos automáticamente.</span>
                          </li>
                        </ul>
                      </div>
                    )}

                    {/* Bottom Save Button & Status Badge */}
                    <div className="mt-8 pt-4 flex flex-wrap items-center gap-4">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-8 py-3.5 rounded-2xl bg-[#0f1f3d] hover:bg-[#1d4ed8] text-white font-black uppercase tracking-wider text-xs flex items-center gap-2.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <span>Guardar Cambios</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                          </>
                        )}
                      </button>

                      {/* Active Status Badge */}
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          Servicio Activo
                        </span>
                      </div>

                      {saveSuccess && (
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          ¡Configuraciones guardadas!
                        </span>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Placeholder Card for Next Integrations */}
              <div className="opacity-50 grayscale pointer-events-none p-8 rounded-[36px] border border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="size-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-xs">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#0f1f3d]">
                      Shopify & Webshop Sync
                    </h3>
                    <p className="text-xs font-medium text-slate-500">Próximamente</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
