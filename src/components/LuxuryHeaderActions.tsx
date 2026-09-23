"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "message" | "inventory" | "system" | "sale";
  read: boolean;
  link?: string;
};

export default function LuxuryHeaderActions() {
  const pathname = usePathname();
  const [isOpenNotifications, setIsOpenNotifications] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "notif-1",
      title: "Nueva actualización en Inventario",
      description: "Dispositivos iPhone actualizados en catálogo.",
      time: "Hace 5 min",
      type: "inventory",
      read: false,
      link: "/inventory",
    },
    {
      id: "notif-2",
      title: "Canal PitayaCore WA Activo",
      description: "Mensajería con clientes y recepción de turnos en línea.",
      time: "Hace 15 min",
      type: "message",
      read: false,
      link: "/messages",
    },
    {
      id: "notif-3",
      title: "Caja Mostrador Abierta",
      description: "Turno de ventas iniciado correctamente.",
      time: "Hoy",
      type: "sale",
      read: true,
      link: "/sales",
    },
  ]);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpenNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Poll or check unread messages
  useEffect(() => {
    let cancelled = false;
    const checkUnread = async () => {
      try {
        const res = await fetch("/api/messages/conversations?tab=whatsapp", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          const convs = Array.isArray(data.conversations) ? data.conversations : [];
          // Count conversations with unread or recent activity
          const count = convs.filter((c: any) => c.unread > 0).length;
          setUnreadMessagesCount(count);
        }
      } catch {
        // Ignore background poll errors
      }
    };

    checkUnread();
    const interval = setInterval(checkUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const isMessagesActive = pathname.startsWith("/messages");

  return (
    <div className="flex items-center gap-2.5 relative">
      {/* 1. Notification Bell Button (Luxury Style) */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpenNotifications(!isOpenNotifications)}
          className={`relative flex size-10 items-center justify-center rounded-xl border transition-all ${
            isOpenNotifications
              ? "bg-[#eef5ff] border-[#2563eb] text-[#2563eb] shadow-sm"
              : "bg-white/80 border-[#c7dcff] text-[#5f7298] hover:text-[#0f1f3d] hover:bg-[#f4f8ff] hover:border-[#2563eb]/40"
          }`}
          title="Notificaciones del Sistema"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>

          {/* Indicator Dot */}
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 size-2.5 rounded-full bg-indigo-600 ring-2 ring-white animate-pulse" />
          )}
        </button>

        {/* Notifications Popover Dropdown */}
        {isOpenNotifications && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#c7dcff] shadow-2xl z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="p-4 border-b border-[#e2edff] flex items-center justify-between bg-gradient-to-r from-[#f8fbff] to-white">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs uppercase tracking-wider text-[#0f1f3d]">
                  Notificaciones
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                    {unreadCount} nuevas
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] font-bold text-[#2563eb] hover:underline"
                >
                  Marcar leídas
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-100">
              {notifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.link || "#"}
                  onClick={() => setIsOpenNotifications(false)}
                  className={`block p-3 rounded-xl transition-all ${
                    item.read
                      ? "hover:bg-[#f8faff] opacity-80"
                      : "bg-[#f4f8ff] hover:bg-[#eef5ff]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-xs font-bold text-[#0f1f3d] flex items-center gap-1.5">
                      {!item.read && (
                        <span className="size-1.5 rounded-full bg-indigo-600 shrink-0" />
                      )}
                      {item.title}
                    </h4>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {item.time}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
              <Link
                href="/messages"
                onClick={() => setIsOpenNotifications(false)}
                className="text-[11px] font-bold text-[#2563eb] hover:underline"
              >
                Ver todos los mensajes y canales →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 2. Yellow Letter/Envelope Mail Button (Exact Luxury Style) */}
      <Link
        href="/messages"
        className={`relative flex size-10 items-center justify-center rounded-xl border transition-all ${
          isMessagesActive
            ? "bg-amber-400 border-amber-500 text-white shadow-md shadow-amber-400/30 scale-105"
            : "bg-amber-50 border-amber-300/80 text-amber-600 hover:bg-amber-100 hover:border-amber-400 shadow-sm"
        }`}
        title="Mensajes y WhatsApp (Luxury OS)"
      >
        {/* Mail / Envelope Icon */}
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>

        {/* Dynamic Badge for unread WhatsApp or internal chats */}
        {unreadMessagesCount > 0 && (
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white">
            {unreadMessagesCount}
          </span>
        )}
      </Link>
    </div>
  );
}
