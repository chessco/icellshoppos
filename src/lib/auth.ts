import { SignJWT, jwtVerify } from "jose";
import type { AppLocale } from "@/lib/i18n/config";

export const SESSION_COOKIE_NAME = "icellshop_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export type SessionMembership = {
  organizationId: string;
  role: "superadmin" | "admin" | "staff";
};

export type SessionPayload = {
  userId: string;
  email: string;
  isSuperadmin: boolean;
  memberships: SessionMembership[];
  activeOrganizationId?: string;
  preferredLanguage?: AppLocale;
};

const getSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET in environment variables.");
  }
  return new TextEncoder().encode(secret);
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
