import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checkEmailCodeRateLimit } from "@/lib/code-rate-limit";
import crypto from "crypto";

/**
 * POST /api/auth/request-password-reset
 * Body: { email: string }
 * Returns: { success: boolean, message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007").replace(/\/$/, "");
    const body = await req.json().catch(() => ({}));
    const normalizedEmail = String((body as { email?: unknown })?.email ?? "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ success: false, message: "Missing email" }, { status: 400 });
    }

    const rateLimit = await checkEmailCodeRateLimit(normalizedEmail, "password_reset");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many password reset requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const genericMessage = `If an account exists for ${normalizedEmail}, a password reset link has been sent.`;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return NextResponse.json({ success: true, message: genericMessage });
    }

    // Generate token and expiry
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    const codeHash = crypto.createHash("sha256").update(token).digest("hex");

    // Store token in EmailVerificationCode (purpose: "password_reset")
    await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        email: normalizedEmail,
        purpose: "password_reset",
        codeHash,
        expiresAt: expires,
      },
    });

    // Send email
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await sendEmail({
      to: normalizedEmail,
      subject: "Reset your password - iCellShop",
      text: `Reset your password using this link: ${resetUrl}\n\nThis link expires in 30 minutes.`,
      html: `<p>Reset your password using this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p>`,
    });

    return NextResponse.json({
      success: true,
      message: genericMessage,
    });
  } catch (error) {
    console.error("[auth/request-password-reset] failed", error);
    return NextResponse.json(
      { success: false, message: "Unable to send reset link right now. Please try again." },
      { status: 500 }
    );
  }
}
