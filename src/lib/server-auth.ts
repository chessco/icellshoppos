import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, type SessionPayload, verifySessionToken } from "@/lib/auth";

export async function getRequestSession(request: NextRequest): Promise<SessionPayload | null> {
  let token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(request: NextRequest): Promise<SessionPayload> {
  const session = await getRequestSession(request);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export function getActiveMembership(session: SessionPayload) {
  if (!session.activeOrganizationId) return null;
  const membership =
    session.memberships.find(
      (membership) => membership.organizationId === session.activeOrganizationId
    ) ?? null;

  if (membership) return membership;

  if (session.isSuperadmin) {
    return {
      organizationId: session.activeOrganizationId,
      role: "superadmin" as const,
    };
  }

  return null;
}
