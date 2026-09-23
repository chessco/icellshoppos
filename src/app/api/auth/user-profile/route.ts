import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";
import {
  getLocaleCookieOptions,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  resolveLocale,
} from "@/lib/i18n/config";

const selectUserProfile = {
  id: true,
  email: true,
  fullName: true,
  whatsapp: true,
  preferredLanguage: true,
  createdAt: true,
  status: true,
} as const;

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: selectUserProfile,
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let organization: { id: string; name: string; slug: string } | null = null;
  let role: string | null = null;

  if (session.activeOrganizationId) {
    const org = await db.organization.findUnique({
      where: { id: session.activeOrganizationId },
      select: { id: true, name: true, slug: true },
    });
    organization = org;

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.activeOrganizationId,
          userId: session.userId,
        },
      },
      select: { role: true },
    });
    role = membership?.role ?? (session.isSuperadmin ? "superadmin" : null);
  } else if (session.isSuperadmin) {
    role = "superadmin";
  }

  return NextResponse.json({
    user,
    organization,
    role,
    isSuperadmin: Boolean(session.isSuperadmin),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fullName = String(body?.fullName ?? "").trim();
  const whatsapp = normalizeWhatsappFromPayload(body ?? {});
  const preferredLanguageRaw = body?.preferredLanguage;
  const preferredLanguage = isSupportedLocale(preferredLanguageRaw)
    ? preferredLanguageRaw
    : resolveLocale(preferredLanguageRaw);

  if (!fullName) {
    return NextResponse.json(
      { error: "Full name and WhatsApp number are required." },
      { status: 400 }
    );
  }

  if (!whatsapp) {
    return NextResponse.json(
      { error: "WhatsApp must include a valid country code (+52 or +1) and a 10-digit number." },
      { status: 400 }
    );
  }

  const user = await db.user.update({
    where: { id: session.userId },
    data: { fullName, whatsapp, preferredLanguage },
    select: selectUserProfile,
  });

  if (session.activeOrganizationId) {
    await db.auditLog.create({
      data: {
        organizationId: session.activeOrganizationId,
        actorUserId: session.userId,
        action: "update_profile",
        entity: "User",
        entityId: session.userId,
        meta: {
          updatedFields: ["fullName", "whatsapp", "preferredLanguage"],
        },
      },
    }).catch(() => null);
  }

  const response = NextResponse.json({ user });
  response.cookies.set(
    LOCALE_COOKIE_NAME,
    resolveLocale(user.preferredLanguage),
    getLocaleCookieOptions()
  );
  return response;
}
