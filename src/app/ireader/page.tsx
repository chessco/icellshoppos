import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { readLatestRelease } from "@/lib/ireader-releases";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "iReader by Pro Buyer — Windows Download",
  description:
    "Download iReader by Pro Buyer for Windows — the USB Apple device intake client for Pro Buyer POS.",
};

export default async function IReaderDownloadPage() {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const release = await readLatestRelease();
  const installer = release?.files.find((file) => file.url.toLowerCase().endsWith(".exe"));
  const downloadUrl = installer ? `/downloads/${encodeURIComponent(installer.url)}` : null;

  const releaseDateLabel = release?.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString(locale === "es" ? "es-MX" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="rounded-3xl border border-[#d6e4ff] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(231,244,255,0.92))] p-6 shadow-[0_20px_48px_rgba(37,99,235,0.14)] sm:p-10">
          <Link href="/" className="inline-flex items-center">
            <img
              src="/api/public/app-brand-logo"
              alt="Website logo"
              className="h-7 w-auto max-w-[200px] object-contain"
            />
          </Link>

          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#4b6292]">
            iReader by Pro Buyer
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight text-[#0f1f3d] sm:text-4xl">
            {locale === "es" ? "Descarga para Windows" : "Windows Desktop App"}
          </h1>
          <p className="mt-4 max-w-xl text-sm text-[#5f7298] sm:text-base">
            {locale === "es"
              ? "iReader es el cliente de recepción de dispositivos Apple por USB para Pro Buyer POS — lee IMEI, número de serie, salud de batería y más directamente desde un iPhone o iPad conectado."
              : "iReader is the USB Apple device intake client for Pro Buyer POS — read IMEI, serial number, battery health, and more directly from a connected iPhone or iPad."}
          </p>

          {release && downloadUrl ? (
            <div className="mt-6 rounded-2xl border border-[#e1ecff] bg-white/90 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">
                {locale === "es" ? "Última versión" : "Latest Version"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#0f1f3d]">{release.version}</p>
              <p className="mt-1 text-xs text-[#5f7298]">
                Windows{releaseDateLabel ? ` · ${locale === "es" ? "Publicado" : "Released"} ${releaseDateLabel}` : ""}
              </p>
              <Link
                href={downloadUrl}
                className="mt-4 inline-flex rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
              >
                {locale === "es" ? "Descargar iReader para Windows" : "Download iReader for Windows"}
              </Link>
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-[#e1ecff] bg-white/90 p-5 text-sm text-[#5f7298]">
              {locale === "es"
                ? "No hay ninguna versión publicada actualmente."
                : "No release is currently published."}
            </p>
          )}
        </header>
      </div>
    </main>
  );
}
