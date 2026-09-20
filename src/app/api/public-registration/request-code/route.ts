import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendVerificationCodeEmail } from "@/lib/email";
import { checkEmailCodeRateLimit } from "@/lib/code-rate-limit";

const REGISTRATION_VERIFICATION_PURPOSE = "public-registration";
const VERIFICATION_TTL_MINUTES = 10;

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const generateCode = () => String(randomInt(100000, 1000000));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const rateLimit = await checkEmailCodeRateLimit(email, REGISTRATION_VERIFICATION_PURPOSE);
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

    await db.emailVerificationCode.create({
      data: {
        email,
        purpose: REGISTRATION_VERIFICATION_PURPOSE,
        codeHash: hashCode(code),
        expiresAt,
      },
    });

    await sendVerificationCodeEmail(email, code);

    return NextResponse.json({ success: true, expiresInMinutes: VERIFICATION_TTL_MINUTES });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
