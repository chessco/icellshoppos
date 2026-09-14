import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSessionCookieOptions,
  signSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { requireSession } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const organizationId = String(body?.organizationId ?? "").trim();

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const isMember = session.memberships.some(
      (membership) => membership.organizationId === organizationId
    );

    if (!isMember && !session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (session.isSuperadmin) {
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
      }
    }

    const token = await signSessionToken({
      ...session,
      activeOrganizationId: organizationId,
    });

    const response = NextResponse.json({ success: true, activeOrganizationId: organizationId });
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
