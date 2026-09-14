import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import LocaleProvider from "@/components/LocaleProvider";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import "./globals2.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Pro Buyer — Smart POS for Cell Phone Resellers",
    template: "%s | Pro Buyer",
  },
  description:
    "Pro Buyer is the smart POS for cell phone resellers — inventory, sales, purchase orders, pricing, and receipts, built for speed and growth.",
  keywords: [
    "cell phone POS",
    "phone reseller software",
    "iPhone inventory management",
    "IMEI tracking",
    "wholesale phone management",
    "cell phone shop software",
  ],
  metadataBase: new URL("https://probuyer.org"),
  openGraph: {
    type: "website",
    url: "https://probuyer.org",
    title: "Pro Buyer — Smart POS for Cell Phone Resellers",
    description:
      "Manage inventory, sales, purchase orders, pricing, and receipts in one place.",
    siteName: "Pro Buyer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pro Buyer — Smart POS for Cell Phone Resellers",
    description:
      "Manage inventory, sales, purchase orders, pricing, and receipts in one place.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${displayFont.variable} ${bodyFont.variable}`}>
        <LocaleProvider initialLocale={initialLocale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
