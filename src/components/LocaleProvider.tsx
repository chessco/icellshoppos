"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, translate } from "@/lib/i18n/dictionaries";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  getLocaleCookieOptions,
  type AppLocale,
} from "@/lib/i18n/config";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, fallback?: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export default function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() => resolveLocale(initialLocale));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!stored) return;

    const next = resolveLocale(stored);
    if (next !== resolveLocale(initialLocale)) {
      setLocaleState(next);
    }
  }, [initialLocale]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }

    const options = getLocaleCookieOptions();
    const secure = options.secure ? "; Secure" : "";
    const maxAge = typeof options.maxAge === "number" ? `; Max-Age=${options.maxAge}` : "";
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=${options.path}; SameSite=${options.sameSite}${secure}${maxAge}`;

    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (nextLocale: AppLocale) => {
      setLocaleState(resolveLocale(nextLocale));
    },
    t: (key: string, fallback?: string) => translate(locale, key, fallback),
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
};

export const useT = () => {
  const { t } = useLocale();
  return t;
};
