import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";
import { getEffectiveMailConfig, type MailProviderType } from "@/lib/email";

const maskSecret = (val?: string) => {
  if (!val) return "";
  const trimmed = val.trim();
  if (trimmed.length <= 6) return "••••••";
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-2)}`;
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await getEffectiveMailConfig();

    return NextResponse.json({
      provider: config.provider,
      resend: {
        apiKeyMasked: maskSecret(config.resendApiKey),
        hasApiKey: Boolean(config.resendApiKey),
        fromEmail: config.resendFromEmail,
      },
      mailgun: {
        apiKeyMasked: maskSecret(config.mailgunApiKey),
        hasApiKey: Boolean(config.mailgunApiKey),
        domain: config.mailgunDomain,
        fromEmail: config.mailgunFrom,
        region: config.mailgunRegion,
      },
      gmail: {
        user: config.gmailUser,
        hasAppPassword: Boolean(config.gmailAppPassword),
        appPasswordMasked: maskSecret(config.gmailAppPassword),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      provider,
      resendApiKey,
      resendFromEmail,
      mailgunApiKey,
      mailgunDomain,
      mailgunFrom,
      mailgunRegion,
      gmailUser,
      gmailAppPassword,
    } = body ?? {};

    const updates: Array<{ key: string; value: string }> = [];

    if (provider && ["resend", "mailgun", "gmail"].includes(provider)) {
      updates.push({ key: "MAIL_PROVIDER", value: provider });
    }

    if (typeof resendFromEmail === "string") {
      updates.push({ key: "RESEND_FROM_EMAIL", value: resendFromEmail.trim() });
    }
    if (typeof resendApiKey === "string" && resendApiKey.trim() && !resendApiKey.includes("••••")) {
      updates.push({ key: "RESEND_API_KEY", value: resendApiKey.trim() });
    }

    if (typeof mailgunDomain === "string") {
      updates.push({ key: "MAILGUN_DOMAIN", value: mailgunDomain.trim() });
    }
    if (typeof mailgunFrom === "string") {
      updates.push({ key: "MAILGUN_FROM", value: mailgunFrom.trim() });
    }
    if (typeof mailgunRegion === "string") {
      updates.push({ key: "MAILGUN_REGION", value: mailgunRegion.trim().toUpperCase() });
    }
    if (typeof mailgunApiKey === "string" && mailgunApiKey.trim() && !mailgunApiKey.includes("••••")) {
      updates.push({ key: "MAILGUN_API_KEY", value: mailgunApiKey.trim().replace(/\s+/g, "") });
    }

    if (typeof gmailUser === "string") {
      updates.push({ key: "GMAIL_USER", value: gmailUser.trim().toLowerCase() });
    }
    if (typeof gmailAppPassword === "string" && gmailAppPassword.trim() && !gmailAppPassword.includes("••••")) {
      updates.push({ key: "GMAIL_APP_PASSWORD", value: gmailAppPassword.trim().replace(/\s+/g, "") });
    }

    if (updates.length > 0) {
      await db.$transaction(
        updates.map(({ key, value }) =>
          db.systemSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          })
        )
      );
    }

    const updatedConfig = await getEffectiveMailConfig();

    return NextResponse.json({
      success: true,
      message: "Email settings updated successfully.",
      provider: updatedConfig.provider,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: error?.message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}
