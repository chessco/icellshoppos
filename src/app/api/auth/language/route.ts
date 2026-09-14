import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";
import {
  getLocaleCookieOptions,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  resolveLocale,
} from "@/lib/i18n/config";
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const body = await request.json().catch(() => ({}));
    const preferredLanguageRaw = body?.preferredLanguage;

    if (!isSupportedLocale(preferredLanguageRaw)) {
      return NextResponse.json({ error: "Invalid language option." }, { status: 400 });
    }

    const preferredLanguage = resolveLocale(preferredLanguageRaw);

    await db.user.update({
      where: { id: session.userId },
      data: { preferredLanguage },
    });

    const token = await signSessionToken({
      ...session,
      preferredLanguage,
    });

    const response = NextResponse.json({ success: true, preferredLanguage });
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.set(LOCALE_COOKIE_NAME, preferredLanguage, getLocaleCookieOptions());
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
