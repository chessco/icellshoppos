import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  localeFromAcceptLanguage,
  getLocaleCookieOptions,
} from "@/lib/i18n/config";

const PUBLIC_PAGE_PATHS = new Set(["/login", "/register", "/reset-password", "/public-inventory"]);
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/register/request-code",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/cron/dio-reminders",
  "/api/public-inventory",
  "/api/public-registration",
  "/api/public-registration/request-code",
  "/api/public/app-brand-logo",
  // Stripe webhooks are authenticated by signature, not session cookie
  "/api/billing/webhook",
  "/api/billing/stripe-webhook",
]);

const isPublicInventoryPath = (pathname: string) => {
  // Allow access to /[slug] pages (but not other protected routes)
  if (pathname.startsWith("/api/public-inventory-by-slug/")) {
    return true;
  }
  if (pathname.startsWith("/api/public-customer-check/")) {
    return true;
  }
  if (pathname.startsWith("/api/public-purchase-request/")) {
    return true;
  }
  // Check if it's a potential slug route (single segment, not a known protected route)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && !pathname.startsWith("/_")) {
    const knownRoutes = [
      "login", "register", "reset-password", "dashboard", "inventory", "add-device",
      "sales", "purchase-orders", "data", "device-guide", "pricing", "public-inventory",
      "public-inventory-settings", "profile", "my-orders", "admin", "billing"
    ];
    return !knownRoutes.includes(segments[0]);
  }
  return false;
};

const isStaticAssetPath = (pathname: string) => {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
};

const withLocaleCookie = (request: NextRequest, response: NextResponse) => {
  const existingLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (isSupportedLocale(existingLocale)) {
    return response;
  }

  const locale = localeFromAcceptLanguage(request.headers.get("accept-language"));
  response.cookies.set(LOCALE_COOKIE_NAME, locale, getLocaleCookieOptions());
  return response;
};

const addCorsHeaders = (response: NextResponse, request: NextRequest) => {
  const origin = request.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Requested-With, Accept");
  }
  return response;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight for API routes
  if (pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 204 });
      return addCorsHeaders(response, request);
    }
  }

  if (pathname === "/") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return withLocaleCookie(request, NextResponse.next());
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return withLocaleCookie(request, NextResponse.next());
    }

    return withLocaleCookie(request, NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  if (pathname === "/public-inventory") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const session = await verifySessionToken(token);
      if (session) {
        return withLocaleCookie(
          request,
          NextResponse.redirect(new URL("/public-inventory-settings", request.url))
        );
      }
    }
  }

  if (isStaticAssetPath(pathname)) {
    return withLocaleCookie(request, NextResponse.next());
  }

  if (PUBLIC_PAGE_PATHS.has(pathname) || PUBLIC_API_PATHS.has(pathname) || isPublicInventoryPath(pathname)) {
    return withLocaleCookie(request, NextResponse.next());
  }

  let token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return addCorsHeaders(withLocaleCookie(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 })), request);
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withLocaleCookie(request, NextResponse.redirect(loginUrl));
  }

  const session = await verifySessionToken(token);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return addCorsHeaders(withLocaleCookie(request, NextResponse.json({ error: "Invalid session" }, { status: 401 })), request);
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withLocaleCookie(request, NextResponse.redirect(loginUrl));
  }

  if (pathname === "/login") {
    const nextUrl = new URL("/dashboard", request.url);
    return withLocaleCookie(request, NextResponse.redirect(nextUrl));
  }

  if (pathname.startsWith("/api/admin/") && !session.isSuperadmin) {
    return withLocaleCookie(request, NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !session.isSuperadmin) {
    const dashboardUrl = new URL("/dashboard", request.url);
    dashboardUrl.searchParams.set("notice", "admin-denied");
    return withLocaleCookie(request, NextResponse.redirect(dashboardUrl));
  }

  if (pathname.startsWith("/api/org/") && !session.activeOrganizationId) {
    return withLocaleCookie(
      request,
      NextResponse.json(
        { error: "No active organization selected" },
        { status: 403 }
      )
    );
  }

  return withLocaleCookie(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
