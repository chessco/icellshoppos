"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n/config";

export default function LanguageToggle() {
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();
  const [saving, setSaving] = useState(false);

  const handleSetLocale = async (nextLocale: AppLocale) => {
    if (nextLocale === locale || saving) return;

    setSaving(true);
    setLocale(nextLocale);

    try {
      await fetch("/api/auth/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: nextLocale }),
      });
    } catch {
      // no-op for anonymous users or transient failures
    } finally {
      router.refresh();
      setSaving(false);
    }
  };

  return (
    <div className="fixed right-3 top-3 z-[70] rounded-full border border-[#bfd4ff] bg-white/95 px-1 py-1 shadow-[0_8px_22px_rgba(15,31,61,0.18)] backdrop-blur">
      <div className="sr-only">{t("lang.toggle", "Language")}</div>
      <div className="flex items-center gap-1">
        {SUPPORTED_LOCALES.map((entry) => {
          const active = entry === locale;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => void handleSetLocale(entry)}
              disabled={saving}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-[#2563eb] text-white"
                  : "text-[#1f3563] hover:bg-[#ebf3ff]"
              }`}
            >
              {entry.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
