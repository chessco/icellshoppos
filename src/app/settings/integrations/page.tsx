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
    stripe_mode: "live",
    stripe_secret_key: "",
    stripe_publishable_key: "",
    stripe_webhook_secret: "",
    stripe_location_id: "",
    stripe_account_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showStripeWebhook, setShowStripeWebhook] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Stripe Connection Test State
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<{
    success: boolean;
    connected: boolean;
    message?: string;
    error?: string;
    businessName?: string;
    primaryCurrency?: string;
    livemode?: boolean;
    accountId?: string;
  } | null>(null);

  // Stripe Terminal Management State
  const [locations, setLocations] = useState<Array<{ id: string; displayName: string; address: any }>>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [readers, setReaders] = useState<Array<{
    id: string;
    label: string | null;
    deviceType: string;
    serialNumber: string;
    status: string;
    location: string | null;
    ipAddress?: string;
  }>>([]);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [registrationCodeInput, setRegistrationCodeInput] = useState("");
  const [readerLabelInput, setReaderLabelInput] = useState("");
  const [registeringReader, setRegisteringReader] = useState(false);
  const [readerActionMessage, setReaderActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Live Test Charge State
  const [testChargeAmount, setTestChargeAmount] = useState("10");
  const [testingCharge, setTestingCharge] = useState(false);
  const [chargeTestResult, setChargeTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    dashboardUrl?: string;
    paymentIntent?: { id: string; amount: number; currency: string; status: string; dashboardUrl?: string };
  } | null>(null);

  // WhatsApp Test State
  const [testWhatsAppPhone, setTestWhatsAppPhone] = useState("");
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<{
    success: boolean;
    connected: boolean;
    message?: string;
    error?: string;
    webFallbackUrl?: string;
  } | null>(null);

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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  const handleTestStripe = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);

    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_stripe",
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStripeTestResult(data);
      } else {
        setStripeTestResult({
          success: false,
          connected: false,
          error: data.error || "No se pudo conectar con Stripe API.",
        });
      }
    } catch (err) {
      setStripeTestResult({
        success: false,
        connected: false,
        error: "Error de red al conectar con Stripe API.",
      });
    } finally {
      setTestingStripe(false);
    }
  };

  const handleFetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list_stripe_locations",
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocations(data.locations || []);
        if (data.locations?.length > 0 && !settings.stripe_location_id) {
          setSettings((prev) => ({ ...prev, stripe_location_id: data.locations[0].id }));
        }
      } else {
        alert(data.error || "No se pudieron obtener las ubicaciones.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleCreateDefaultLocation = async () => {
    setCreatingLocation(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_stripe_location",
          displayName: "Sucursal Principal iCellShop",
          saveAsDefault: true,
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings((prev) => ({ ...prev, stripe_location_id: data.location.id }));
        setLocations((prev) => [data.location, ...prev]);
        alert(`Ubicación creada con éxito: ${data.location.displayName} (${data.location.id})`);
      } else {
        alert(data.error || "Error al crear ubicación.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleFetchReaders = async () => {
    setLoadingReaders(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list_stripe_readers",
          locationId: settings.stripe_location_id || undefined,
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReaders(data.readers || []);
      } else {
        alert(data.error || "No se pudieron obtener los lectores.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReaders(false);
    }
  };

  const handleRegisterReader = async (codeOverride?: string, labelOverride?: string) => {
    const code = codeOverride || registrationCodeInput.trim();
    const label = labelOverride || readerLabelInput.trim() || "Terminal de Mostrador";
    if (!code) {
      alert("Por favor ingresa un código de registro.");
      return;
    }
    setRegisteringReader(true);
    setReaderActionMessage(null);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_stripe_reader",
          registrationCode: code,
          label,
          locationId: settings.stripe_location_id || undefined,
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReaderActionMessage({
          type: "success",
          text: `¡Lector registrado con éxito! ${data.reader.label} (${data.reader.serialNumber})`,
        });
        setRegistrationCodeInput("");
        setReaderLabelInput("");
        void handleFetchReaders();
      } else {
        setReaderActionMessage({
          type: "error",
          text: data.error || "No se pudo registrar el lector en Stripe.",
        });
      }
    } catch (e) {
      setReaderActionMessage({ type: "error", text: "Error de conexión con el servidor." });
    } finally {
      setRegisteringReader(false);
    }
  };

  const handleTestCharge = async () => {
    setTestingCharge(true);
    setChargeTestResult(null);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_stripe_charge",
          amount: testChargeAmount,
          stripe_secret_key: settings.stripe_secret_key,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setChargeTestResult(data);
      } else {
        setChargeTestResult({
          success: false,
          error: data.error || "No se pudo generar el cobro de prueba en Stripe.",
        });
      }
    } catch (e) {
      setChargeTestResult({
        success: false,
        error: "Error de conexión al ejecutar cobro de prueba.",
      });
    } finally {
      setTestingCharge(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsappTestResult(null);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_whatsapp",
          phone: testWhatsAppPhone || settings.pitayacore_authorizer_phone,
          whatsapp_provider: settings.whatsapp_provider,
          pitayacore_api_url: settings.pitayacore_api_url,
          pitayacore_api_key: settings.pitayacore_api_key,
          pitayacore_tenant_id: settings.pitayacore_tenant_id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWhatsappTestResult({
          success: true,
          connected: true,
          message: data.message || "¡Mensaje de WhatsApp entregado exitosamente!",
          webFallbackUrl: data.webFallbackUrl,
        });
      } else {
        setWhatsappTestResult({
          success: false,
          connected: false,
          error: data.error || "No se pudo entregar el mensaje de prueba.",
          webFallbackUrl: data.webFallbackUrl,
        });
      }
    } catch (e) {
      setWhatsappTestResult({
        success: false,
        connected: false,
        error: "Error de red al intentar enviar el mensaje de prueba.",
      });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Top Navbar with CurrentOrgBadge */}
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(244,248,255,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#0f1f3d]">
          <div className="flex items-center gap-3">
            <CurrentOrgBadge />
            <span className="hidden h-4 w-px bg-slate-300 md:block" />
            <span className="hidden text-xs font-semibold uppercase tracking-widest text-slate-500 md:block">
              Ajustes &amp; Integraciones
            </span>
          </div>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname="/settings/integrations" />

        <main className="max-w-5xl min-w-0 p-6 md:p-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 p-20">
              <div className="size-10 animate-spin rounded-full border-3 border-[#2563eb] border-t-transparent" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cargando integraciones...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {/* Header Title & Subtitle */}
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight text-[#0f1f3d] md:text-4xl">
                  Integraciones
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Conecte el sistema POS con pasarelas de pago (Stripe, Tap to Pay) y herramientas externas.
                </p>
              </div>

              {/* INTEGRATION CARD: STRIPE PAYMENTS & TAP TO PAY */}
              <div className="group relative overflow-hidden rounded-[36px] border border-[#c7dcff] bg-white p-8 shadow-sm md:p-10">
                <div className="absolute top-8 right-8 hidden sm:flex">
                  <div className="size-16 flex items-center justify-center rounded-3xl border border-indigo-100 bg-indigo-50 text-[#635BFF] shadow-sm">
                    <svg className="size-8 fill-current" viewBox="0 0 24 24">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                    </svg>
                  </div>
                </div>

                <div className="w-full max-w-3xl">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black uppercase tracking-wider text-[#0f1f3d]">
                      Stripe &amp; Tap to Pay
                    </h2>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                      Pasarela Oficial
                    </span>
                  </div>
                  <p className="mt-2 mb-6 text-sm font-medium leading-relaxed text-slate-600">
                    Configure las credenciales de la API de Stripe para habilitar cobros con tarjeta en el POS, Terminales inteligentes (BBPOS / WisePOS) y Tap to Pay en iPhone / iPad.
                  </p>

                  <form onSubmit={handleSave} className="space-y-6">
                    {/* Modo Selector */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Entorno de Operación
                      </label>
                      <div className="grid max-w-md grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, stripe_mode: "live" }))}
                          className={`rounded-2xl border-2 py-3 px-4 text-xs font-black uppercase tracking-wider transition-all ${
                            settings.stripe_mode === "live"
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-emerald-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          🟢 Producción (Live)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, stripe_mode: "test" }))}
                          className={`rounded-2xl border-2 py-3 px-4 text-xs font-black uppercase tracking-wider transition-all ${
                            settings.stripe_mode === "test"
                              ? "border-amber-600 bg-amber-600 text-white shadow-md shadow-amber-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-amber-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          🟡 Pruebas (Test Mode)
                        </button>
                      </div>
                    </div>

                    {/* Stripe Secret Key */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Stripe Secret Key ({settings.stripe_mode === "live" ? "sk_live_..." : "sk_test_..."})
                      </label>
                      <div className="relative">
                        <input
                          type={showStripeSecret ? "text" : "password"}
                          value={settings.stripe_secret_key || ""}
                          onChange={(e) => setSettings({ ...settings, stripe_secret_key: e.target.value })}
                          placeholder={settings.stripe_mode === "live" ? "sk_live_51..." : "sk_test_51..."}
                          className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 pr-12 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowStripeSecret(!showStripeSecret)}
                          className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title="Mostrar / Ocultar Clave"
                        >
                          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                      </div>
                      <p className="px-1 text-[10px] text-slate-400">
                        Utilizada exclusivamente en el servidor seguro para autenticar cobros e intents.
                      </p>
                    </div>

                    {/* Stripe Publishable Key */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Stripe Publishable Key ({settings.stripe_mode === "live" ? "pk_live_..." : "pk_test_..."})
                      </label>
                      <input
                        type="text"
                        value={settings.stripe_publishable_key || ""}
                        onChange={(e) => setSettings({ ...settings, stripe_publishable_key: e.target.value })}
                        placeholder={settings.stripe_mode === "live" ? "pk_live_51..." : "pk_test_51..."}
                        className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                      />
                      <p className="px-1 text-[10px] text-slate-400">
                        Clave pública para inicializar el SDK del Terminal y lectores móviles.
                      </p>
                    </div>

                    {/* Stripe Webhook Secret */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Stripe Webhook Signing Secret (whsec_...)
                      </label>
                      <div className="relative">
                        <input
                          type={showStripeWebhook ? "text" : "password"}
                          value={settings.stripe_webhook_secret || ""}
                          onChange={(e) => setSettings({ ...settings, stripe_webhook_secret: e.target.value })}
                          placeholder="whsec_..."
                          className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 pr-12 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowStripeWebhook(!showStripeWebhook)}
                          className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          title="Mostrar / Ocultar Clave"
                        >
                          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        </button>
                      </div>
                      <p className="px-1 text-[10px] text-slate-400">
                        Endpoint webhook: <code className="text-[#2563eb]">https://probuyer.pitayacode.io/api/payments/stripe/webhook</code>
                      </p>
                    </div>

                    {/* Stripe Terminal Location ID */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Stripe Terminal Location ID (Opcional - tml_...)
                      </label>
                      <input
                        type="text"
                        value={settings.stripe_location_id || ""}
                        onChange={(e) => setSettings({ ...settings, stripe_location_id: e.target.value })}
                        placeholder="tml_..."
                        className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                      />
                      <p className="px-1 text-[10px] text-slate-400">
                        Ubicación creada en el Dashboard de Stripe para agrupar lectores físicos y Tap to Pay.
                      </p>
                    </div>

                    {/* Test Results Display */}
                    {stripeTestResult && (
                      <div
                        className={`rounded-2xl border p-4 text-xs font-semibold ${
                          stripeTestResult.success
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-rose-300 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {stripeTestResult.success ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 font-bold text-emerald-900">
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>{stripeTestResult.message}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">
                              Comercio: <strong>{stripeTestResult.businessName}</strong> | Moneda: <strong>{stripeTestResult.primaryCurrency}</strong> | ID: {stripeTestResult.accountId}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>{stripeTestResult.error}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons: Save & Test */}
                    <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-[#e8f0ff] pt-6">
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2.5 rounded-2xl bg-[#0f1f3d] px-8 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#1d4ed8] active:scale-95 disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <span>Guardar Configuración Stripe</span>
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleTestStripe}
                        disabled={testingStripe || !settings.stripe_secret_key}
                        className="flex items-center gap-2 rounded-2xl border-2 border-indigo-300 bg-indigo-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 hover:border-indigo-400 active:scale-95 disabled:opacity-50"
                      >
                        {testingStripe ? (
                          <>
                            <div className="size-3.5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                            <span>Verificando con Stripe API...</span>
                          </>
                        ) : (
                          <>
                            <span>⚡ Probar Conexión Stripe</span>
                          </>
                        )}
                      </button>

                      {saveSuccess && (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 animate-in fade-in">
                          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          ¡Configuraciones guardadas!
                        </span>
                      )}
                    </div>
                  </form>

                  {/* ─────────────────────────────────────────────────────────────
                      SUB-PANEL 1: GESTIÓN DE UBICACIONES (STRIPE LOCATIONS)
                  ───────────────────────────────────────────────────────────── */}
                  <div className="mt-10 rounded-3xl border border-[#d6e4ff] bg-[#f8fbff] p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2edff] pb-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-[#0f1f3d]">
                          📍 Ubicaciones de Terminal (Stripe Locations)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Requeridas por Stripe para asociar lectores físicos (como Stripe M2 o S700) y cobros.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleFetchLocations}
                          disabled={loadingLocations || !settings.stripe_secret_key}
                          className="rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {loadingLocations ? "Consultando..." : "🔍 Consultar Ubicaciones"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateDefaultLocation}
                          disabled={creatingLocation || !settings.stripe_secret_key}
                          className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {creatingLocation ? "Creando..." : "➕ Crear Ubicación en Stripe"}
                        </button>
                      </div>
                    </div>

                    {locations.length > 0 ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {locations.map((loc) => {
                          const isSelected = settings.stripe_location_id === loc.id;
                          return (
                            <div
                              key={loc.id}
                              onClick={() => setSettings((s) => ({ ...s, stripe_location_id: loc.id }))}
                              className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                                isSelected
                                  ? "border-indigo-600 bg-indigo-50/70 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#0f1f3d]">{loc.displayName}</span>
                                {isSelected && (
                                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                    ✓ Seleccionada
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-mono text-[11px] text-slate-500">{loc.id}</p>
                              {loc.address && (
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {loc.address.city}, {loc.address.country}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-4 text-center text-xs text-slate-400">
                        Presiona &quot;Consultar Ubicaciones&quot; para cargar las existentes o &quot;Crear Ubicación&quot; para registrar una nueva automáticamente.
                      </p>
                    )}
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      SUB-PANEL 2: ENLACE Y GESTIÓN DE TERMINALES / LECTORES
                  ───────────────────────────────────────────────────────────── */}
                  <div className="mt-8 rounded-3xl border border-[#d6e4ff] bg-[#f8fbff] p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2edff] pb-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-[#0f1f3d]">
                          📟 Lectores y Terminales Registrados
                        </h3>
                        <p className="text-xs text-slate-500">
                          Lectores vinculados a tu cuenta de Stripe para cobros en punto de venta.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleFetchReaders}
                          disabled={loadingReaders || !settings.stripe_secret_key}
                          className="rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {loadingReaders ? "Buscando..." : "🔄 Actualizar Lista"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegisterReader("simulated-wpos-1", "Lector Simulado WisePOS E")}
                          disabled={registeringReader || !settings.stripe_secret_key}
                          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                          title="Crea un lector de prueba oficial de Stripe para simular cobros"
                        >
                          {registeringReader ? "Registrando..." : "🧪 Crear Lector Simulado (WisePOS E)"}
                        </button>
                      </div>
                    </div>

                    {readerActionMessage && (
                      <div
                        className={`mt-4 rounded-xl p-3 text-xs font-semibold ${
                          readerActionMessage.type === "success"
                            ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border border-rose-300 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {readerActionMessage.text}
                      </div>
                    )}

                    {/* Formulario de registro de Lector */}
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Registrar Nuevo Lector Físico / Smart Reader
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                          type="text"
                          value={registrationCodeInput}
                          onChange={(e) => setRegistrationCodeInput(e.target.value)}
                          placeholder="Código de Registro (ej. quick-brown-fox o serial)"
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-[#0f1f3d] outline-none focus:border-indigo-600"
                        />
                        <input
                          type="text"
                          value={readerLabelInput}
                          onChange={(e) => setReaderLabelInput(e.target.value)}
                          placeholder="Etiqueta (ej. Mostrador Caja 1)"
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-[#0f1f3d] outline-none focus:border-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleRegisterReader()}
                          disabled={registeringReader || !registrationCodeInput.trim()}
                          className="rounded-xl bg-[#0f1f3d] px-4 py-2 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
                        >
                          {registeringReader ? "Vinculando..." : "🔗 Enlazar Lector a Stripe"}
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-400">
                        Nota: Los lectores <strong>Stripe Reader M2</strong> se enlazan directamente por Bluetooth en el iPad. Los lectores inteligentes (WisePOS E / S700) muestran un código de registro en su pantalla táctil para enlazarlos aquí.
                      </p>
                    </div>

                    {/* Lista de lectores */}
                    {readers.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {readers.map((r) => (
                          <div
                            key={r.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">
                                {r.deviceType?.includes("wisepad") || r.deviceType?.includes("m2") ? "📱" : "📟"}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-[#0f1f3d]">
                                  {r.label || r.deviceType} <span className="font-mono text-slate-400 font-normal">({r.serialNumber})</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Tipo: <span className="font-semibold text-slate-700">{r.deviceType}</span> • ID: <span className="font-mono">{r.id}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  r.status === "online"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {r.status === "online" ? "🟢 En Línea" : "⚪ " + r.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-center text-xs text-slate-400">
                        No hay lectores registrados en la lista actual. Presiona &quot;Actualizar Lista&quot; o crea un lector de prueba.
                      </p>
                    )}
                  </div>

                  {/* ─────────────────────────────────────────────────────────────
                      SUB-PANEL 3: SIMULADOR DE COBRO EN VIVO (TEST RUNNER)
                  ───────────────────────────────────────────────────────────── */}
                  <div className="mt-8 rounded-3xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 pb-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-indigo-950">
                          ⚡ Simulador de Cobro en Vivo (Live Test Runner)
                        </h3>
                        <p className="text-xs text-slate-600">
                          Prueba la creación de un cobro con Stripe Terminal desde esta misma página.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2.5 shadow-sm">
                        <span className="text-xs font-bold text-slate-500">Monto:</span>
                        <span className="text-xs font-bold text-slate-900">$</span>
                        <input
                          type="number"
                          value={testChargeAmount}
                          onChange={(e) => setTestChargeAmount(e.target.value)}
                          className="w-20 font-mono text-xs font-bold text-[#0f1f3d] outline-none"
                          min="1"
                        />
                        <span className="text-xs font-bold text-slate-500">MXN</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestCharge}
                        disabled={testingCharge || !settings.stripe_secret_key}
                        className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                      >
                        {testingCharge ? (
                          <>
                            <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Procesando en Stripe...</span>
                          </>
                        ) : (
                          <>
                            <span>💳 Ejecutar Cobro de Prueba</span>
                          </>
                        )}
                      </button>
                    </div>

                    {chargeTestResult && (
                      <div
                        className={`mt-4 rounded-2xl border p-4 text-xs ${
                          chargeTestResult.success
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-rose-300 bg-rose-50 text-rose-900"
                        }`}
                      >
                        {chargeTestResult.success ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                              <span>✅ {chargeTestResult.message}</span>
                            </div>
                            <div className="font-mono text-[11px] text-emerald-700">
                              PaymentIntent ID: <strong>{chargeTestResult.paymentIntent?.id}</strong> | Estado: <strong>{chargeTestResult.paymentIntent?.status}</strong>
                            </div>
                            {chargeTestResult.paymentIntent?.dashboardUrl && (
                              <a
                                href={chargeTestResult.paymentIntent.dashboardUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <span>Ver Transacción en Stripe Dashboard ↗</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="font-bold text-rose-700">
                            ❌ {chargeTestResult.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* INTEGRATION CARD: WHATSAPP BOT */}
              <div className="group relative overflow-hidden rounded-[36px] border border-[#c7dcff] bg-white p-8 shadow-sm md:p-10">
                <div className="absolute top-8 right-8 hidden sm:flex">
                  <div className="size-16 flex items-center justify-center rounded-3xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-sm">
                    <svg className="size-8 fill-current" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                    </svg>
                  </div>
                </div>

                <div className="w-full max-w-2xl">
                  <h2 className="mb-2 text-2xl font-black uppercase tracking-wider text-[#0f1f3d]">
                    WhatsApp Bot
                  </h2>
                  <p className="mb-8 text-sm font-medium leading-relaxed text-slate-600">
                    Automatice las notificaciones de ventas, turnos y recordatorios al WhatsApp de sus clientes seleccionando entre la integración oficial o una API externa basada en una librería JS.
                  </p>

                  <form onSubmit={handleSave} className="space-y-6">
                    {/* Provider Toggle Tabs */}
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Proveedor de WhatsApp Activo
                      </label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "FLOW" }))}
                          className={`rounded-2xl border-2 py-3.5 px-4 text-xs font-black uppercase tracking-wider transition-all ${
                            settings.whatsapp_provider === "FLOW"
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-indigo-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          Meta Oficial (Flow)
                        </button>

                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "PITAYACORE" }))}
                          className={`rounded-2xl border-2 py-3.5 px-4 text-xs font-black uppercase tracking-wider transition-all ${
                            settings.whatsapp_provider === "PITAYACORE"
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                              : "border-[#d6e4ff] bg-[#f8fbff] text-slate-600 hover:border-indigo-400 hover:text-[#0f1f3d]"
                          }`}
                        >
                          Librería JS (PitayaCore)
                        </button>

                        <button
                          type="button"
                          onClick={() => setSettings((s) => ({ ...s, whatsapp_provider: "LINKS" }))}
                          className={`rounded-2xl border-2 py-3.5 px-4 text-xs font-black uppercase tracking-wider transition-all ${
                            settings.whatsapp_provider === "LINKS"
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
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
                            className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
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
                              className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 pr-12 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              title="Mostrar / Ocultar Token"
                            >
                              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                          />
                        </div>

                        {/* Separador de sección — Autorizaciones */}
                        <div className="border-t border-[#e8f0ff] pt-4">
                          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">
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
                                className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                              />
                              <p className="px-1 text-[10px] text-slate-400">
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
                                className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                              />
                              <p className="px-1 text-[10px] text-slate-400">
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
                                className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                              />
                              <p className="px-1 text-[10px] text-slate-400">
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
                            className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
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
                            className="w-full rounded-2xl border border-[#c7dcff] bg-[#f8fbff] px-5 py-3.5 font-mono text-xs text-[#0f1f3d] outline-none transition-all focus:border-indigo-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROVIDER: LINKS INFO */}
                    {settings.whatsapp_provider === "LINKS" && (
                      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-6">
                        <div className="flex items-center gap-3">
                          <div className="size-10 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#0f1f3d]">
                              WhatsApp Web — Sin configuración requerida
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              No necesita servidor ni credenciales API. Los mensajes se abren directamente mediante enlaces wa.me.
                            </p>
                          </div>
                        </div>

                        <ul className="space-y-2 border-t border-emerald-200/50 pt-3 text-xs text-slate-700">
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Botón &quot;WA App&quot;:</strong> Abre WhatsApp nativo en computadoras y tabletas.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Botón &quot;WA Web&quot;:</strong> Abre web.whatsapp.com en una pestaña nueva.</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            <span><strong>Prefijo México +52:</strong> Normaliza números de 10 dígitos automáticamente.</span>
                          </li>
                        </ul>
                      </div>
                    )}

                    {/* TEST WHATSAPP CONNECTION PANEL */}
                    <div className="mt-8 rounded-3xl border border-indigo-100 bg-[#f8fbff] p-6 shadow-xs">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-wider text-[#0f1f3d]">
                            🧪 Diagnóstico y Prueba de WhatsApp en Vivo
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Valide en tiempo real la conexión del tenant con PitayaCore enviando un mensaje de prueba a un teléfono real.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5 block">
                            Número de WhatsApp para la prueba (10 o 12-13 dígitos)
                          </label>
                          <input
                            type="text"
                            value={testWhatsAppPhone}
                            onChange={(e) => setTestWhatsAppPhone(e.target.value)}
                            placeholder={settings.pitayacore_authorizer_phone || "ej. 5212223334455 o 2223334455"}
                            className="w-full rounded-2xl border border-[#c7dcff] bg-white px-4 py-3 font-mono text-xs text-[#0f1f3d] outline-none focus:border-indigo-600"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleTestWhatsApp}
                          disabled={testingWhatsApp}
                          className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                        >
                          {testingWhatsApp ? (
                            <>
                              <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              <span>Enviando a PitayaCore...</span>
                            </>
                          ) : (
                            <>
                              <span>📲 Enviar WhatsApp de Prueba</span>
                            </>
                          )}
                        </button>
                      </div>

                      {whatsappTestResult && (
                        <div
                          className={`mt-4 rounded-2xl border p-4 text-xs ${
                            whatsappTestResult.success
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : "border-rose-300 bg-rose-50 text-rose-900"
                          }`}
                        >
                          {whatsappTestResult.success ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                                <span>✅ {whatsappTestResult.message}</span>
                              </div>
                              <p className="text-[11px] text-emerald-700 font-medium">
                                El tenant y la API Key están activos y el mensaje fue despachado al servidor de WhatsApp correctamente.
                              </p>
                              {whatsappTestResult.webFallbackUrl && (
                                <a
                                  href={whatsappTestResult.webFallbackUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 mt-1"
                                >
                                  <span>Abrir en WhatsApp Web ↗</span>
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-bold text-rose-800 text-sm">
                                ❌ Error al enviar mensaje:
                              </div>
                              <div className="font-mono text-xs text-rose-700">
                                {whatsappTestResult.error}
                              </div>
                              {whatsappTestResult.webFallbackUrl && (
                                <div className="pt-2">
                                  <a
                                    href={whatsappTestResult.webFallbackUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                                  >
                                    <span>Abrir enlace directo wa.me ↗</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Save Button & Status Badge */}
                    <div className="mt-8 flex flex-wrap items-center gap-4 pt-4">
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2.5 rounded-2xl bg-[#0f1f3d] px-8 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#1d4ed8] active:scale-95 disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <span>Guardar Configuración WhatsApp</span>
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                          </>
                        )}
                      </button>

                      {/* Active Status Badge */}
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-700">
                        <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          Servicio Activo
                        </span>
                      </div>

                      {saveSuccess && (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 animate-in fade-in">
                          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      Shopify &amp; Webshop Sync
                    </h3>
                    <p className="text-xs font-medium text-slate-500">Próximamente</p>
                  </div>
                </div>
                <svg className="size-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

