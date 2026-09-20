import type { NextRequest, NextResponse } from "next/server";

export function isAllowedOrigin(origin: string | null | undefined, requestOrigin?: string): boolean {
  if (!origin) return false;

  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) return false;

  // Same-origin check
  if (requestOrigin && trimmedOrigin.toLowerCase() === requestOrigin.trim().toLowerCase()) {
    return true;
  }

  // Allowlist from environment variable (comma-separated)
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  if (envOrigins.includes(trimmedOrigin.toLowerCase())) {
    return true;
  }

  // Development environment allowlist (localhost, 127.0.0.1, [::1])
  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(trimmedOrigin);
      if (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]" ||
        url.hostname.startsWith("192.168.") ||
        url.hostname.startsWith("10.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(url.hostname)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function addCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin) {
    return response;
  }

  if (isAllowedOrigin(origin, request.nextUrl.origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie, X-Requested-With, Accept"
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}
