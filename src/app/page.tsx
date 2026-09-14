import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/dictionaries";

export const metadata: Metadata = {
  title: "Pro Buyer — Smart POS for Cell Phone Resellers",
  description:
    "Pro Buyer is the smart POS for cell phone resellers — inventory, sales, purchase orders, pricing, and receipts, built for speed and growth.",
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isAuthenticated = Boolean(session?.userId);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const t = (key: string, fallback?: string) => translate(locale, key, fallback);

  const pillars = locale === "es"
    ? [
        {
          title: "Escanea y captura rápido",
          detail:
            "Usa flujos de QR e IMEI para registrar cada equipo con modelo, color, capacidad, batería, proveedor y precios en segundos.",
        },
        {
          title: "Opera como equipo",
          detail:
            "Cada organización tiene su propio espacio, usuarios y planes para que dueños, compradores y ventas trabajen con control.",
        },
        {
          title: "Vende con control",
          detail:
            "Gestiona ventas, órdenes de compra, inventario público y facturación en un solo lugar con acceso por roles.",
        },
      ]
    : [
        {
          title: "Scan And Capture Fast",
          detail:
            "Use QR and IMEI workflows to register each device with model, color, capacity, battery health, supplier, and pricing in seconds.",
        },
        {
          title: "Operate As A Team",
          detail:
            "Each organization has its own workspace, users, plans, and auditability so owners, buyers, and sales staff can work together safely.",
        },
        {
          title: "Sell With Control",
          detail:
            "Manage sales, purchase orders, public inventory sharing, and billing from one place with role-aware access and Stripe-backed subscriptions.",
        },
      ];

  const flow = locale === "es"
    ? [
        "Crea tu organización e invita a tu equipo.",
        "Carga inventario con detalle por IMEI y niveles de precio.",
        "Controla disponibilidad, ventas y márgenes desde el panel.",
        "Publica un URL de inventario para solicitudes de clientes.",
      ]
    : [
        "Create your organization and invite your team.",
        "Load inventory with IMEI-level detail and pricing tiers.",
        "Track availability, sales, and margins from the dashboard.",
        "Publish a public inventory URL for customer requests.",
      ];

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="rounded-3xl border border-[#d6e4ff] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(231,244,255,0.92))] p-6 shadow-[0_20px_48px_rgba(37,99,235,0.14)] sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="https://www.probuyer.org"
              className="inline-flex items-center"
            >
              <img
                src="/api/public/app-brand-logo"
                alt="Website logo"
                className="h-7 w-auto max-w-[200px] object-contain"
              />
            </Link>
            <div className="flex flex-wrap gap-2">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                >
                  {t("landing.dashboard", "Dashboard")}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-full border border-[#bfd5ff] px-4 py-2 text-sm font-semibold text-[#12316d] hover:bg-[#eef5ff]"
                  >
                    {t("landing.signIn", "Sign In")}
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                  >
                    {t("landing.startFreeTrial", "Start Free Trial")}
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <section>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#0f1f3d] sm:text-5xl">
                {locale === "es"
                  ? "Operación mayorista de iPhone, desde recepción hasta reventa, en un solo flujo POS."
                  : "Wholesale iPhone operations, from receiving to resale, in one POS workflow."}
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-[#5f7298] sm:text-base">
                {locale === "es"
                  ? "Pro Buyer está hecho para equipos que compran, clasifican, fijan precio y mueven inventario rápido. Controla equipos por IMEI, gestiona órdenes de compra y ventas, y mantén una sola fuente de verdad para tu negocio."
                  : "Pro Buyer is built for teams that buy, grade, price, and move phone inventory fast. Track devices by IMEI, manage purchase orders and sales, and keep one live source of truth across your business."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    className="rounded-full bg-[#0f1f3d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#152b54]"
                  >
                    {t("landing.dashboard", "Dashboard")}
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/register"
                      className="rounded-full bg-[#0f1f3d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#152b54]"
                    >
                      {t("landing.createAccount", "Create Account")}
                    </Link>
                    <Link
                      href="/login"
                      className="rounded-full border border-[#bfd5ff] px-5 py-2.5 text-sm font-semibold text-[#12316d] hover:bg-[#eef5ff]"
                    >
                      {t("landing.existingUserLogin", "Existing User Login")}
                    </Link>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#d6e4ff] bg-white/90 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4b6292]">{t("landing.howItWorks", "How It Works")}</p>
              <ol className="mt-3 grid gap-3 text-sm text-[#1f3563]">
                {flow.map((step, idx) => (
                  <li key={step} className="flex items-start gap-3 rounded-xl border border-[#e1ecff] bg-[#f7fbff] px-3 py-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-xs font-bold text-white">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-[#d6e4ff] bg-white/90 p-5 shadow-[0_12px_30px_rgba(37,99,235,0.1)]"
            >
              <h2 className="text-lg font-semibold text-[#0f1f3d]">{pillar.title}</h2>
              <p className="mt-2 text-sm text-[#5f7298]">{pillar.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-[#d6e4ff] bg-[linear-gradient(130deg,rgba(15,31,61,0.96),rgba(22,69,165,0.95))] p-7 text-white sm:p-9">
          <h2 className="text-2xl font-semibold">{t("landing.builtForTeams", "Built For Serious Phone Inventory Teams")}</h2>
          <p className="mt-3 max-w-3xl text-sm text-[#dbe8ff] sm:text-base">
            {locale === "es"
              ? "En lugar de depender de hojas de cálculo y chats, Pro Buyer le da a tu equipo un sistema operativo para inventario, ventas, clientes, control organizacional y facturación de suscripción."
              : "Instead of juggling spreadsheets and chat threads, Pro Buyer gives your team one operational system for inventory, checkout, customer records, organization controls, and subscription billing."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0f1f3d] hover:bg-[#eef5ff]"
              >
                {t("landing.dashboard", "Dashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0f1f3d] hover:bg-[#eef5ff]"
                >
                  {t("landing.start14DayTrial", "Start 14-Day Trial")}
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-[#7ea2e6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {t("landing.goToLogin", "Go To Login")}
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
