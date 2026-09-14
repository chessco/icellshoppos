import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSessionCookieOptions,
  signSessionToken,
  SESSION_COOKIE_NAME,
  type SessionMembership,
} from "@/lib/auth";
import {
  LOCALE_COOKIE_NAME,
  localeFromAcceptLanguage,
  getLocaleCookieOptions,
} from "@/lib/i18n/config";
import { hashInviteToken } from "@/lib/org-invites";
import { getSeatAvailabilityForOrganization } from "@/lib/org-seats";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";

const REGISTER_VERIFICATION_PURPOSE = "app-register";
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_PLAN_CODE = "free";

// Starter plan logic removed. Use Free Trial, Basic, or Pro only.

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `org-${Date.now()}`;

const buildUniqueSlug = async (base: string) => {
  let slug = normalizeSlug(base);
  if (!slug) slug = `org-${Date.now()}`;

  const exists = await db.organization.findUnique({ where: { slug } });
  if (!exists) return slug;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${slug}-${randomInt(1000, 10000)}`;
    const taken = await db.organization.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }

  return `${slug}-${Date.now()}`;
};

export async function POST(request: NextRequest) {
  try {
    const defaultLocale = localeFromAcceptLanguage(request.headers.get("accept-language"));
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const fullName = String(body?.fullName ?? "").trim();
    const organizationName = String(body?.organizationName ?? "").trim();
    const inviteToken = String(body?.inviteToken ?? "").trim();
    const whatsapp = normalizeWhatsappFromPayload(body ?? {});
    const verificationCode = String(body?.verificationCode ?? "").trim();

    if (!email || !password || !fullName || (!organizationName && !inviteToken)) {
      return NextResponse.json(
        { error: "Email, password, full name, and WhatsApp number are required. Organization name is required unless using an invite." },
        { status: 400 }
      );
    }

    if (!whatsapp) {
      return NextResponse.json(
        { error: "WhatsApp must include a valid country code (+52 or +1) and a 10-digit number." },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      return NextResponse.json(
        { error: "A valid 6-digit verification code is required." },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered." }, { status: 400 });
    }

    const latestCode = await db.emailVerificationCode.findFirst({
      where: {
        email,
        purpose: REGISTER_VERIFICATION_PURPOSE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!latestCode) {
      return NextResponse.json(
        { error: "Verification code not found. Request a new code." },
        { status: 400 }
      );
    }

    if (latestCode.consumedAt) {
      return NextResponse.json(
        { error: "Verification code already used. Request a new code." },
        { status: 400 }
      );
    }

    if (latestCode.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Verification code expired. Request a new code." },
        { status: 400 }
      );
    }

    const incomingHash = hashCode(verificationCode);
    if (incomingHash !== latestCode.codeHash) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    let inviteRecord:
      | {
          id: string;
          organizationId: string;
          email: string;
          role: "superadmin" | "admin" | "staff";
          permissionsJson: unknown;
          status: string;
          expiresAt: Date;
        }
      | null = null;

    if (inviteToken) {
      inviteRecord = await db.organizationInvite.findUnique({
        where: { tokenHash: hashInviteToken(inviteToken) },
        select: {
          id: true,
          organizationId: true,
          email: true,
          role: true,
          permissionsJson: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!inviteRecord || inviteRecord.status !== "pending") {
        return NextResponse.json({ error: "Invite is invalid or no longer active." }, { status: 400 });
      }

      if (inviteRecord.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Invite has expired." }, { status: 400 });
      }

      if (inviteRecord.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Invite email must match registration email." }, { status: 400 });
      }

      const seatAvailability = await getSeatAvailabilityForOrganization({
        organizationId: inviteRecord.organizationId,
      });

      if (!seatAvailability.canAddSeat) {
        return NextResponse.json(
          {
            error:
              seatAvailability.reason ??
              "No seats available for this organization. Ask your admin to click 'Add Seat via Portal' in Billing.",
          },
          { status: 402 }
        );
      }
    }

    const plan = inviteRecord
      ? null
      : await db.plan.findFirst({
      where: { code: DEFAULT_PLAN_CODE, active: true },
      select: {
        id: true,
        code: true,
        trialDays: true,
        basePriceCents: true,
      },
    });

    if (!inviteRecord && !plan) {
      return NextResponse.json(
        { error: `Default plan '${DEFAULT_PLAN_CODE}' is not configured.` },
        { status: 500 }
      );
    }

    const now = new Date();
    const trialEndsAt = plan ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : now;
    const passwordHash = await bcrypt.hash(password, 12);
    const slug = inviteRecord ? "" : await buildUniqueSlug(organizationName);

    const result = await db.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          whatsapp,
          preferredLanguage: defaultLocale,
          status: "active",
        },
      });

      let organization: { id: string; name: string; slug: string };
      let membership: { role: "superadmin" | "admin" | "staff" };

      if (inviteRecord) {
        const existingOrganization = await transaction.organization.findUnique({
          where: { id: inviteRecord.organizationId },
          select: { id: true, name: true, slug: true },
        });

        if (!existingOrganization) {
          throw new Error("Invited organization not found.");
        }

        organization = existingOrganization;
        membership = await transaction.membership.create({
          data: {
            organizationId: inviteRecord.organizationId,
            userId: user.id,
            role: inviteRecord.role,
            permissionsJson: inviteRecord.permissionsJson ?? {},
          },
          select: { role: true },
        });

        await transaction.organizationInvite.update({
          where: { id: inviteRecord.id },
          data: {
            status: "accepted",
            acceptedByUserId: user.id,
          },
        });

        await transaction.auditLog.create({
          data: {
            organizationId: inviteRecord.organizationId,
            actorUserId: user.id,
            action: "join_org_via_invite",
            entity: "Membership",
            entityId: user.id,
          },
        });
      } else {
        const activePlan = plan!;

        organization = await transaction.organization.create({
          data: {
            name: organizationName,
            slug,
            status: "active",
          },
        });

        membership = await transaction.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: "admin",
            permissionsJson: {},
          },
          select: { role: true },
        });

        const subscription = await transaction.subscription.create({
          data: {
            organizationId: organization.id,
            planId: activePlan.id,
            status: "trialing",
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        });

        await transaction.subscriptionItem.create({
          data: {
            id: `${subscription.id}-base`,
            subscriptionId: subscription.id,
            itemType: "base",
            quantity: 1,
            unitPriceCents: activePlan.basePriceCents,
          },
        });

        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: user.id,
            action: "register_org",
            entity: "Organization",
            entityId: organization.id,
            meta: {
              planCode: activePlan.code,
            },
          },
        });
      }

      await transaction.emailVerificationCode.update({
        where: { id: latestCode.id },
        data: { consumedAt: new Date() },
      });

      return { user, organization, membership };
    });

    const memberships: SessionMembership[] = [
      {
        organizationId: result.organization.id,
        role: result.membership.role,
      },
    ];

    const token = await signSessionToken({
      userId: result.user.id,
      email: result.user.email,
      isSuperadmin: false,
      memberships,
      activeOrganizationId: result.organization.id,
      preferredLanguage: defaultLocale,
    });

    const response = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        whatsapp: result.user.whatsapp,
        activeOrganizationId: result.organization.id,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    response.cookies.set(LOCALE_COOKIE_NAME, defaultLocale, getLocaleCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
