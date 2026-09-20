import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendVerificationCodeEmail } from "@/lib/email";
import { hashInviteToken } from "@/lib/org-invites";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";
import { checkEmailCodeRateLimit } from "@/lib/code-rate-limit";

const inviteDelegate = db as unknown as {
  organizationInvite: {
    findUnique: (args: unknown) => Promise<
      | {
          email: string;
          status: string;
          expiresAt: Date;
        }
      | null
    >;
  };
};

const REGISTER_VERIFICATION_PURPOSE = "app-register";
const VERIFICATION_TTL_MINUTES = 10;
const ALLOW_REGISTER_CODE_FALLBACK = process.env.ALLOW_REGISTER_CODE_FALLBACK === "true";

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const generateCode = () => String(randomInt(100000, 1000000));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const fullName = String(body?.fullName ?? "").trim();
    const password = String(body?.password ?? "");
    const organizationName = String(body?.organizationName ?? "").trim();
    const inviteToken = String(body?.inviteToken ?? "").trim();
    const whatsapp = normalizeWhatsappFromPayload(body ?? {});

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!fullName || !password || (!organizationName && !inviteToken)) {
      return NextResponse.json(
        { error: "Full name, WhatsApp number, email, and password are required. Organization name is required unless you have an invite." },
        { status: 400 }
      );
    }

    if (inviteToken) {
      const invite = await inviteDelegate.organizationInvite.findUnique({
        where: { tokenHash: hashInviteToken(inviteToken) },
        select: {
          email: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!invite || invite.status !== "pending") {
        return NextResponse.json({ error: "Invite is invalid or no longer active." }, { status: 400 });
      }

      if (invite.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Invite has expired." }, { status: 400 });
      }

      if (invite.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Invite email must match registration email." }, { status: 400 });
      }
    }

    if (!whatsapp) {
      return NextResponse.json(
        { error: "WhatsApp must include a valid country code (+52 or +1) and a 10-digit number." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters before sending the verification code." },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered." }, { status: 400 });
    }

    const rateLimit = await checkEmailCodeRateLimit(email, REGISTER_VERIFICATION_PURPOSE);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.error, retryAfterSeconds: rateLimit.retryAfterSeconds },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const code = generateCode();
    const now = Date.now();
    const expiresAt = new Date(now + VERIFICATION_TTL_MINUTES * 60 * 1000);

    const verificationRecord = await db.emailVerificationCode.create({
      data: {
        email,
        purpose: REGISTER_VERIFICATION_PURPOSE,
        codeHash: hashCode(code),
        expiresAt,
      },
    });

    try {
      await sendVerificationCodeEmail(email, code);
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Email service unavailable";
      console.error("[register/request-code] verification email send failed", {
        email,
        message,
      });

      const isMailgunConfigError =
        message.includes("MAILGUN_API_KEY") ||
        message.includes("MAILGUN_DOMAIN") ||
        message.includes("MAIL_FROM") ||
        message.includes("must match MAILGUN_DOMAIN");

      if (ALLOW_REGISTER_CODE_FALLBACK) {
        return NextResponse.json({
          success: true,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
          fallback: true,
          fallbackCode: code,
          warning: "Email service unavailable. Using fallback code delivery.",
        });
      }

      await db.emailVerificationCode.delete({ where: { id: verificationRecord.id } }).catch(() => null);

      return NextResponse.json(
        {
          error: isMailgunConfigError
            ? "Email service is not configured. Please contact support."
            : "Could not send verification code email. Please try again in a minute.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, expiresInMinutes: VERIFICATION_TTL_MINUTES });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
