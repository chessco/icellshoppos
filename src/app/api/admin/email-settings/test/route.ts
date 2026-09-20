import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/server-auth";
import { sendTestEmail, type MailProviderType } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      to,
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

    if (!to || typeof to !== "string" || !to.includes("@")) {
      return NextResponse.json(
        { error: "A valid recipient email address is required." },
        { status: 400 }
      );
    }

    const customConfig: Record<string, string> = {};
    if (resendApiKey && !resendApiKey.includes("••••")) {
      customConfig.resendApiKey = resendApiKey.trim();
    }
    if (resendFromEmail) {
      customConfig.resendFromEmail = resendFromEmail.trim();
    }
    if (mailgunApiKey && !mailgunApiKey.includes("••••")) {
      customConfig.mailgunApiKey = mailgunApiKey.trim().replace(/\s+/g, "");
    }
    if (mailgunDomain) {
      customConfig.mailgunDomain = mailgunDomain.trim();
    }
    if (mailgunFrom) {
      customConfig.mailgunFrom = mailgunFrom.trim();
    }
    if (mailgunRegion) {
      customConfig.mailgunRegion = mailgunRegion.trim().toUpperCase();
    }
    if (gmailUser) {
      customConfig.gmailUser = gmailUser.trim().toLowerCase();
    }
    if (gmailAppPassword && !gmailAppPassword.includes("••••")) {
      customConfig.gmailAppPassword = gmailAppPassword.trim().replace(/\s+/g, "");
    }

    const result = await sendTestEmail({
      to: to.trim().toLowerCase(),
      provider: provider as MailProviderType | undefined,
      customConfig: Object.keys(customConfig).length > 0 ? (customConfig as any) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Test email successfully sent to ${to} via ${(provider || "active provider").toUpperCase()}!`,
      details: result,
    });
  } catch (error: any) {
    console.error("[Test Email Error]", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to send test email.",
      },
      { status: error?.message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}
