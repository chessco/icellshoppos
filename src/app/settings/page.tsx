"use client";

import React from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";
import CurrentOrgBadge from "@/components/CurrentOrgBadge";

type SettingCard = {
  title: string;
  description: string;
  href: string;
  icon: string;
  active?: boolean;
};

const settingsCards: SettingCard[] = [
  {
    title: "INTEGRACIONES",
    description: "Conecte WhatsApp Bot, pasarelas de pago y servicios externos.",
    href: "/settings/integrations",
    icon: "hub",
    active: true,
  },
  {
    title: "PERFIL DE LA TIENDA",
    description: "Nombre, dirección, logotipo e información comercial de la organización.",
    href: "/profile",
    icon: "store",
  },
  {
    title: "USUARIOS Y PERMISOS",
    description: "Gestione los integrantes del equipo y sus roles de acceso.",
    href: "/admin/users",
    icon: "group",
  },
  {
    title: "PROCESOS Y COMISIONES",
    description: "Reglas de comisión por vendedor, margen y categorías.",
    href: "/commissions",
    icon: "assignment",
  },
  {
    title: "NOTIFICACIONES",
    description: "Alertas de pedidos, mensajes y actualizaciones de inventario.",
    href: "/messages",
    icon: "notifications",
  },
  {
    title: "FACTURACIÓN Y PLANES",
    description: "Suscripción a Pro Buyer, facturas e historial de pagos.",
    href: "/billing",
    icon: "credit_card",
  },
  {
    title: "SEGURIDAD Y ACCESO",
    description: "Credenciales de acceso, contraseñas y doble autenticación.",
    href: "/profile",
    icon: "lock",
  },
];

export default function SettingsHubPage() {
  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(244,248,255,0.95)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 text-sm text-[#0f1f3d]">
          <div className="flex items-center gap-3">
            <CurrentOrgBadge />
            <span className="h-4 w-px bg-slate-300 hidden md:block" />
            <span className="font-semibold text-xs uppercase tracking-widest text-slate-500 hidden md:block">
              Panel de Configuración
            </span>
          </div>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname="/settings" />

        <main className="min-w-0 p-6 md:p-10 max-w-6xl">
          <div className="flex flex-col gap-8">
            <div>
              <h1 className="text-[#0f1f3d] text-3xl md:text-4xl font-black tracking-tight font-display">
                Configuración
              </h1>
              <p className="text-slate-500 text-sm font-medium mt-2">
                Personalice su experiencia y gestione los parámetros de Pro Buyer POS.
              </p>
            </div>

            {/* Settings Cards Grid matching Luxury OS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {settingsCards.map((card) => {
                const isIntegration = card.active;

                return (
                  <Link
                    key={card.title}
                    href={card.href}
                    className={`group relative p-6 rounded-3xl border transition-all flex items-center gap-5 text-left ${
                      isIntegration
                        ? "bg-white border-[#2563eb] shadow-md shadow-blue-500/10 hover:border-[#1d4ed8] hover:shadow-lg ring-2 ring-blue-500/20"
                        : "bg-white border-[#c7dcff] shadow-xs hover:border-[#2563eb]/40 hover:bg-[#f8fbff]"
                    }`}
                  >
                    {/* Icon container */}
                    <div
                      className={`size-14 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                        isIntegration
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : "bg-[#eef5ff] text-[#2563eb] group-hover:bg-blue-50"
                      }`}
                    >
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        {card.icon === "hub" && (
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                        )}
                        {card.icon === "store" && (
                          <path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z" />
                        )}
                        {card.icon === "group" && (
                          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 3s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                        )}
                        {card.icon === "assignment" && (
                          <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                        )}
                        {card.icon === "notifications" && (
                          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        )}
                        {card.icon === "credit_card" && (
                          <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                        )}
                        {card.icon === "lock" && (
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                        )}
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-xs uppercase tracking-wider text-[#0f1f3d] group-hover:text-[#2563eb] transition-colors">
                          {card.title}
                        </h3>
                        {isIntegration && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                            Activo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-1 leading-snug">
                        {card.description}
                      </p>
                    </div>

                    <div className="text-slate-300 group-hover:text-[#2563eb] group-hover:translate-x-1 transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
