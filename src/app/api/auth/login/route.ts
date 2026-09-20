import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendSuperadminLoginCodeEmail } from "@/lib/email";
import {
  getSessionCookieOptions,
  signSessionToken,
  SESSION_COOKIE_NAME,
  type SessionMembership,
} from "@/lib/auth";
import {
  LOCALE_COOKIE_NAME,
  resolveLocale,
  getLocaleCookieOptions,
} from "@/lib/i18n/config";

const SUPERADMIN_LOGIN_VERIFICATION_PURPOSE = "superadmin-login";
const SUPERADMIN_LOGIN_TTL_MINUTES = 3;
const SUPERADMIN_LOGIN_RESEND_COOLDOWN_SECONDS = 30;
const SUPERADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES = 10;
const SUPERADMIN_LOGIN_MAX_FAILED_ATTEMPTS = 5;
const SUPERADMIN_LOGIN_FAILED_PURPOSE = "superadmin-login-failed";

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

const generateCode = () => String(randomInt(100000, 1000000));

const getCooldownSecondsRemaining = (createdAt: Date) => {
  const elapsedSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
  return Math.max(0, SUPERADMIN_LOGIN_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let email = String(body?.email ?? "").trim().toLowerCase();
    if (email.endsWith("@gmail")) {
      email = `${email}.com`;
    }
    const password = String(body?.password ?? "");
    const verificationCode = String(body?.verificationCode ?? "").trim();
    const requestedOrganizationId = String(body?.organizationId ?? "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          select: {
            organizationId: true,
            role: true,
          },
        },
      },
    });

    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const memberships: SessionMembership[] = user.memberships.map(
      (membership: { organizationId: string; role: "superadmin" | "admin" | "staff" }) => ({
        organizationId: membership.organizationId,
        role: membership.role,
      })
    );

    const configuredSuperadminEmails = (process.env.SUPERADMIN_EMAIL ?? "")
      .toLowerCase()
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const isSuperadmin =
      configuredSuperadminEmails.includes(email) ||
      memberships.some((membership) => membership.role === "superadmin");

    if (isSuperadmin) {
      if (!/^\d{6}$/.test(verificationCode)) {
        const recentAttempt = await db.emailVerificationCode.findFirst({
          where: {
            email,
            purpose: SUPERADMIN_LOGIN_VERIFICATION_PURPOSE,
          },
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
          },
        });

        if (recentAttempt) {
          const cooldownSeconds = getCooldownSecondsRemaining(recentAttempt.createdAt);
          if (cooldownSeconds > 0) {
            return NextResponse.json(
              {
                error: `Please wait ${cooldownSeconds}s before requesting another verification code.`,
                requiresVerification: true,
                cooldownSeconds,
              },
              { status: 429 }
            );
          }
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + SUPERADMIN_LOGIN_TTL_MINUTES * 60 * 1000);

        const verificationRecord = await db.emailVerificationCode.create({
          data: {
            userId: user.id,
            email,
            purpose: SUPERADMIN_LOGIN_VERIFICATION_PURPOSE,
            codeHash: hashCode(code),
            expiresAt,
          },
        });

        console.log(`\n🔑 =======================================================\n[SUPERADMIN 2FA CODE for ${email}]: ${code}\n=======================================================\n`);

        try {
          await sendSuperadminLoginCodeEmail(email, code);
        } catch (mailError) {
          console.warn("[Superadmin 2FA] Email delivery failed, code logged to container output:", mailError);
        }

        return NextResponse.json({
          requiresVerification: true,
          expiresInMinutes: SUPERADMIN_LOGIN_TTL_MINUTES,
          cooldownSeconds: SUPERADMIN_LOGIN_RESEND_COOLDOWN_SECONDS,
          message: "Verification code sent to your email. Enter the 6-digit code to continue.",
        });
      }

      const lockoutWindowStart = new Date(Date.now() - SUPERADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      const failedAttempts = await db.emailVerificationCode.count({
        where: {
          email,
          purpose: SUPERADMIN_LOGIN_FAILED_PURPOSE,
          createdAt: { gte: lockoutWindowStart },
        },
      });

      if (failedAttempts >= SUPERADMIN_LOGIN_MAX_FAILED_ATTEMPTS) {
        return NextResponse.json(
          {
            error: `Too many invalid codes. Try again in ${SUPERADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES} minutes.`,
            requiresVerification: true,
            locked: true,
          },
          { status: 429 }
        );
      }

      const latestCode = await db.emailVerificationCode.findFirst({
        where: {
          email,
          purpose: SUPERADMIN_LOGIN_VERIFICATION_PURPOSE,
          consumedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          codeHash: true,
          expiresAt: true,
        },
      });

      if (!latestCode || latestCode.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json(
          {
            error: "Verification code expired. Sign in again to request a new code.",
            requiresVerification: true,
          },
          { status: 401 }
        );
      }

      if (hashCode(verificationCode) !== latestCode.codeHash) {
        await db.emailVerificationCode.create({
          data: {
            userId: user.id,
            email,
            purpose: SUPERADMIN_LOGIN_FAILED_PURPOSE,
            codeHash: hashCode(`${email}-${Date.now()}-${randomInt(1, 1_000_000)}`),
            expiresAt: new Date(Date.now() + SUPERADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000),
          },
        });

        const remainingAttempts = Math.max(0, SUPERADMIN_LOGIN_MAX_FAILED_ATTEMPTS - failedAttempts - 1);
        return NextResponse.json(
          {
            error:
              remainingAttempts > 0
                ? `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
                : `Invalid verification code. Too many attempts. Try again in ${SUPERADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES} minutes.`,
            requiresVerification: true,
            remainingAttempts,
          },
          { status: 401 }
        );
      }

      await db.emailVerificationCode.update({
        where: { id: latestCode.id },
        data: { consumedAt: new Date() },
      });

      await db.emailVerificationCode.deleteMany({
        where: {
          email,
          purpose: SUPERADMIN_LOGIN_FAILED_PURPOSE,
        },
      });
    }

    const activeOrganizationId =
      requestedOrganizationId &&
      memberships.some((membership) => membership.organizationId === requestedOrganizationId)
        ? requestedOrganizationId
        : memberships[0]?.organizationId;

    const token = await signSessionToken({
      userId: user.id,
      email,
      isSuperadmin,
      memberships,
      activeOrganizationId,
      preferredLanguage: resolveLocale(user.preferredLanguage),
    });

    const response = NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperadmin,
        activeOrganizationId: activeOrganizationId ?? null,
        memberships,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.set(
      LOCALE_COOKIE_NAME,
      resolveLocale(user.preferredLanguage),
      getLocaleCookieOptions()
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
