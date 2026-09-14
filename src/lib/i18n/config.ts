export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE_NAME = "icellshop_locale";
export const LOCALE_STORAGE_KEY = "icellshop_locale";

export const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);

export const resolveLocale = (value: unknown): AppLocale =>
  isSupportedLocale(value) ? value : DEFAULT_LOCALE;

export const localeFromAcceptLanguage = (acceptLanguage: string | null): AppLocale => {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const parts = acceptLanguage
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  for (const part of parts) {
    const [language] = part.split(";");
    if (language === "es" || language.startsWith("es-")) {
      return "es";
    }
  }

  return DEFAULT_LOCALE;
};

export const getLocaleCookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
});
