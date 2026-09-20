"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

type MailProvider = "resend" | "mailgun" | "gmail";

type EmailSettingsState = {
  provider: MailProvider;
  resendApiKey: string;
  resendFromEmail: string;
  mailgunApiKey: string;
  mailgunDomain: string;
  mailgunFrom: string;
  mailgunRegion: string;
  gmailUser: string;
  gmailAppPassword: string;
};

export default function AdminEmailSettingsPage() {
  const pathname = usePathname();

  const [provider, setProvider] = useState<MailProvider>("resend");
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [mailgunApiKey, setMailgunApiKey] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [mailgunFrom, setMailgunFrom] = useState("");
  const [mailgunRegion, setMailgunRegion] = useState("US");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");

  const [hasResendKey, setHasResendKey] = useState(false);
  const [hasMailgunKey, setHasMailgunKey] = useState(false);
  const [hasGmailPass, setHasGmailPass] = useState(false);

  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Test email state
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const res = await fetch("/api/admin/email-settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Failed to load email settings." });
        return;
      }

      if (data.provider) setProvider(data.provider);

      if (data.resend) {
        setHasResendKey(Boolean(data.resend.hasApiKey));
        setResendApiKey(data.resend.apiKeyMasked || "");
        setResendFromEmail(data.resend.fromEmail || "onboarding@resend.dev");
      }

      if (data.mailgun) {
        setHasMailgunKey(Boolean(data.mailgun.hasApiKey));
        setMailgunApiKey(data.mailgun.apiKeyMasked || "");
        setMailgunDomain(data.mailgun.domain || "");
        setMailgunFrom(data.mailgun.fromEmail || "");
        setMailgunRegion(data.mailgun.region || "US");
      }

      if (data.gmail) {
        setHasGmailPass(Boolean(data.gmail.hasAppPassword));
        setGmailUser(data.gmail.user || "");
        setGmailAppPassword(data.gmail.appPasswordMasked || "");
      }
    } catch {
      setFeedback({ type: "error", message: "Failed to connect to email settings API." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, string> = {
        provider,
        resendFromEmail,
        mailgunDomain,
        mailgunFrom,
        mailgunRegion,
        gmailUser,
      };

      if (resendApiKey && !resendApiKey.includes("••••")) {
        payload.resendApiKey = resendApiKey;
      }
      if (mailgunApiKey && !mailgunApiKey.includes("••••")) {
        payload.mailgunApiKey = mailgunApiKey;
      }
      if (gmailAppPassword && !gmailAppPassword.includes("••••")) {
        payload.gmailAppPassword = gmailAppPassword;
      }

      const res = await fetch("/api/admin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Error saving email settings." });
      } else {
        setFeedback({ type: "success", message: "Configuración guardada exitosamente." });
        await fetchSettings();
      }
    } catch {
      setFeedback({ type: "error", message: "Error al guardar la configuración." });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testRecipient || !testRecipient.includes("@")) {
      setTestFeedback({ type: "error", message: "Ingresa un correo electrónico de destino válido." });
      return;
    }

    setTesting(true);
    setTestFeedback(null);
    try {
      const payload: Record<string, string> = {
        to: testRecipient,
        provider,
        resendFromEmail,
        mailgunDomain,
        mailgunFrom,
        mailgunRegion,
        gmailUser,
      };

      if (resendApiKey && !resendApiKey.includes("••••")) {
        payload.resendApiKey = resendApiKey;
      }
      if (mailgunApiKey && !mailgunApiKey.includes("••••")) {
        payload.mailgunApiKey = mailgunApiKey;
      }
      if (gmailAppPassword && !gmailAppPassword.includes("••••")) {
        payload.gmailAppPassword = gmailAppPassword;
      }

      const res = await fetch("/api/admin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setTestFeedback({ type: "error", message: data.error || "Error al enviar correo de prueba." });
      } else {
        setTestFeedback({ type: "success", message: data.message || "Correo de prueba enviado correctamente." });
      }
    } catch {
      setTestFeedback({ type: "error", message: "Error de red al intentar enviar el correo de prueba." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Configuración de Correo</span>
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />

        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">Configuración de Proveedor de Correo</h1>
            <p className="mt-1 text-sm text-[#6a4d3a]">
              Define qué servicio de correo procesa los códigos de verificación 2FA, recibos y notificaciones de Pro Buyer.
            </p>
          </header>

          {feedback && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-[#c3e6cb] bg-[#d4edda] text-[#155724]"
                  : "border-[#f5c6cb] bg-[#f8d7da] text-[#721c24]"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-3 py-12 text-[#6a4d3a]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent"></div>
              <span>Cargando configuración de correos...</span>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              {/* Formulario Principal */}
              <form onSubmit={handleSave} className="flex flex-col gap-6">
                <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-[#1f1a16]">Proveedor Activo de Salida</h2>
                  <p className="mt-1 text-xs text-[#6a4d3a]">
                    El proveedor seleccionado será el responsable de enviar todos los correos del sistema.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {/* Resend */}
                    <label
                      className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition ${
                        provider === "resend"
                          ? "border-[#2563eb] bg-[#f0f6ff] shadow-sm ring-2 ring-[#2563eb]/20"
                          : "border-[#e6d6c6] bg-[#faf6f0] hover:bg-[#f5ece0]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#0f1f3d]">Resend</span>
                        <input
                          type="radio"
                          name="provider"
                          value="resend"
                          checked={provider === "resend"}
                          onChange={() => setProvider("resend")}
                          className="h-4 w-4 text-[#2563eb]"
                        />
                      </div>
                      <span className="mt-1 text-xs text-[#2563eb] font-medium">Recomendado</span>
                      <span className="mt-2 text-[11px] text-[#5f7298]">
                        API REST HTTPS (Puerto 443). Nunca bloqueado por firewalls de hosting.
                      </span>
                    </label>

                    {/* Mailgun */}
                    <label
                      className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition ${
                        provider === "mailgun"
                          ? "border-[#2563eb] bg-[#f0f6ff] shadow-sm ring-2 ring-[#2563eb]/20"
                          : "border-[#e6d6c6] bg-[#faf6f0] hover:bg-[#f5ece0]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#0f1f3d]">Mailgun</span>
                        <input
                          type="radio"
                          name="provider"
                          value="mailgun"
                          checked={provider === "mailgun"}
                          onChange={() => setProvider("mailgun")}
                          className="h-4 w-4 text-[#2563eb]"
                        />
                      </div>
                      <span className="mt-1 text-xs text-[#6a4d3a]">API REST</span>
                      <span className="mt-2 text-[11px] text-[#5f7298]">
                        Envío por HTTP API v3 con soporte para dominios personalizados.
                      </span>
                    </label>

                    {/* Gmail */}
                    <label
                      className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition ${
                        provider === "gmail"
                          ? "border-[#2563eb] bg-[#f0f6ff] shadow-sm ring-2 ring-[#2563eb]/20"
                          : "border-[#e6d6c6] bg-[#faf6f0] hover:bg-[#f5ece0]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#0f1f3d]">Gmail SMTP</span>
                        <input
                          type="radio"
                          name="provider"
                          value="gmail"
                          checked={provider === "gmail"}
                          onChange={() => setProvider("gmail")}
                          className="h-4 w-4 text-[#2563eb]"
                        />
                      </div>
                      <span className="mt-1 text-xs text-[#c24d34]">SMTP Saliente</span>
                      <span className="mt-2 text-[11px] text-[#5f7298]">
                        Requiere que el proveedor de hosting tenga abiertos los puertos SMTP.
                      </span>
                    </label>
                  </div>
                </section>

                {/* Campos Específicos por Proveedor */}
                <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#1f1a16]">
                      Credenciales para {provider === "resend" ? "Resend" : provider === "mailgun" ? "Mailgun" : "Gmail"}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowSecrets(!showSecrets)}
                      className="text-xs text-[#2563eb] hover:underline"
                    >
                      {showSecrets ? "Ocultar Secretos" : "Mostrar Secretos"}
                    </button>
                  </div>

                  {provider === "resend" && (
                    <div className="grid gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">
                          Resend API Key {hasResendKey && <span className="text-xs font-normal text-[#2a7c3b]">(Configurada ✓)</span>}
                        </label>
                        <input
                          type={showSecrets ? "text" : "password"}
                          value={resendApiKey}
                          onChange={(e) => setResendApiKey(e.target.value)}
                          placeholder="re_xxxxxxxxxxxxxx"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                        <p className="mt-1 text-[11px] text-[#5f7298]">
                          Obtén tu clave en <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-[#2563eb] underline">resend.com/api-keys</a>.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">
                          Correo Remitente (From)
                        </label>
                        <input
                          type="text"
                          value={resendFromEmail}
                          onChange={(e) => setResendFromEmail(e.target.value)}
                          placeholder="onboarding@resend.dev o noreply@tudominio.com"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                        <p className="mt-1 text-[11px] text-[#5f7298]">
                          Usa <code>onboarding@resend.dev</code> para pruebas o un remitente de tu dominio verificado en Resend.
                        </p>
                      </div>
                    </div>
                  )}

                  {provider === "mailgun" && (
                    <div className="grid gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">
                          Mailgun API Key {hasMailgunKey && <span className="text-xs font-normal text-[#2a7c3b]">(Configurada ✓)</span>}
                        </label>
                        <input
                          type={showSecrets ? "text" : "password"}
                          value={mailgunApiKey}
                          onChange={(e) => setMailgunApiKey(e.target.value)}
                          placeholder="key-xxxxxxxxxxxxxxxx"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">Dominio Mailgun</label>
                          <input
                            type="text"
                            value={mailgunDomain}
                            onChange={(e) => setMailgunDomain(e.target.value)}
                            placeholder="mg.tudominio.com"
                            className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">Región</label>
                          <select
                            value={mailgunRegion}
                            onChange={(e) => setMailgunRegion(e.target.value)}
                            className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                          >
                            <option value="US">Estados Unidos (US - api.mailgun.net)</option>
                            <option value="EU">Europa (EU - api.eu.mailgun.net)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">Remitente Predeterminado (From)</label>
                        <input
                          type="text"
                          value={mailgunFrom}
                          onChange={(e) => setMailgunFrom(e.target.value)}
                          placeholder="no-reply@mg.tudominio.com"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                      </div>
                    </div>
                  )}

                  {provider === "gmail" && (
                    <div className="grid gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">Usuario Gmail</label>
                        <input
                          type="email"
                          value={gmailUser}
                          onChange={(e) => setGmailUser(e.target.value)}
                          placeholder="tu.correo@gmail.com"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#3b2a1e] mb-1">
                          Contraseña de Aplicación {hasGmailPass && <span className="text-xs font-normal text-[#2a7c3b]">(Configurada ✓)</span>}
                        </label>
                        <input
                          type={showSecrets ? "text" : "password"}
                          value={gmailAppPassword}
                          onChange={(e) => setGmailAppPassword(e.target.value)}
                          placeholder="xxxx xxxx xxxx xxxx"
                          className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                        />
                        <p className="mt-1 text-[11px] text-[#5f7298]">
                          Genera una contraseña de aplicación de 16 caracteres en la seguridad de tu Cuenta de Google (requiere 2FA activo en Google).
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </button>
                  </div>
                </section>
              </form>

              {/* Panel Lateral: Prueba de Envío */}
              <aside className="flex flex-col gap-6">
                <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-[#1f1a16]">Probar Envío en Vivo</h2>
                  <p className="mt-1 text-xs text-[#6a4d3a]">
                    Envía un correo de prueba de inmediato usando el proveedor activo ({provider.toUpperCase()}) para comprobar la entrega.
                  </p>

                  <div className="mt-4 grid gap-3">
                    <label className="text-xs font-semibold text-[#3b2a1e]">Destinatario de Prueba</label>
                    <input
                      type="email"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="info.cdobregon@gmail.com"
                      className="w-full rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#0f1f3d] outline-none focus:border-[#2563eb]"
                    />

                    <button
                      type="button"
                      onClick={handleSendTest}
                      disabled={testing}
                      className="mt-2 w-full rounded-full border border-[#2563eb] bg-[#f0f6ff] py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#2563eb] hover:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {testing ? "Enviando correo..." : "Enviar Correo de Prueba"}
                    </button>

                    {testFeedback && (
                      <div
                        className={`mt-2 rounded-xl p-3 text-xs ${
                          testFeedback.type === "success"
                            ? "border border-[#c3e6cb] bg-[#d4edda] text-[#155724]"
                            : "border border-[#f5c6cb] bg-[#f8d7da] text-[#721c24]"
                        }`}
                      >
                        {testFeedback.message}
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-[#e6d6c6] bg-[#fffaf3] p-5 text-xs text-[#5c4332] space-y-2">
                  <p className="font-semibold text-[#1f1a16]">💡 Resumen de Puertos en Hetzner</p>
                  <p>
                    Hetzner bloquea los puertos SMTP salientes (25, 465, 587) para proteger contra spam.
                  </p>
                  <p>
                    <strong>Resend</strong> y <strong>Mailgun</strong> envían a través de APIs REST sobre el puerto <strong>443 (HTTPS)</strong>, garantizando 100% de confiabilidad.
                  </p>
                </section>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
