import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOrganizationInviteEmail } from "@/lib/email";
import { createInviteToken, getAppBaseUrl, getInviteExpiry, hashInviteToken } from "@/lib/org-invites";
import { ORG_PERMISSION_KEYS, getRequestOrgAccess, type OrgPermissionKey } from "@/lib/org-permissions";
import { getSeatAvailabilityForOrganization } from "@/lib/org-seats";

const inviteDelegate = db as unknown as {
  organizationInvite: {
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    create: (args: unknown) => Promise<unknown>;
  };
};

type InviteRole = "admin" | "staff";

const isInviteRole = (value: string): value is InviteRole =>
  value === "admin" || value === "staff";

const parsePermissions = (value: unknown) => {
  const parsed: Partial<Record<OrgPermissionKey, boolean>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return parsed;
  }

  for (const key of ORG_PERMISSION_KEYS) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "boolean") {
      parsed[key] = candidate;
    }
  }

  return parsed;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const invites = await inviteDelegate.organizationInvite.findMany({
      where: {
        organizationId: access.organizationId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        permissionsJson: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    });

    return NextResponse.json({ invites });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    const roleInput = String((body as { role?: string }).role ?? "staff").trim().toLowerCase();
    const role = isInviteRole(roleInput) ? roleInput : "staff";
    const permissions = parsePermissions((body as { permissions?: unknown }).permissions);

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    const existingMembership = await db.membership.findFirst({
      where: {
        organizationId: access.organizationId,
        user: {
          email,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      return NextResponse.json({ error: "User is already a member of this organization." }, { status: 400 });
    }

    const seatAvailability = await getSeatAvailabilityForOrganization({
      organizationId: access.organizationId,
      includePendingInvites: true,
    });

    if (!seatAvailability.canAddSeat) {
      return NextResponse.json(
        {
          error:
            seatAvailability.reason ??
            "No seats available for your current plan. Go to Billing and click 'Add Seat via Portal' to purchase an extra seat.",
        },
        { status: 402 }
      );
    }

    await inviteDelegate.organizationInvite.updateMany({
      where: {
        organizationId: access.organizationId,
        email,
        status: "pending",
      },
      data: {
        status: "revoked",
      },
    });

    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = getInviteExpiry();

    const invite = await inviteDelegate.organizationInvite.create({
      data: {
        organizationId: access.organizationId,
        email,
        role,
        permissionsJson: permissions,
        tokenHash,
        status: "pending",
        expiresAt,
        invitedByUserId: access.session.userId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        permissionsJson: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const organization = await db.organization.findUnique({
      where: { id: access.organizationId },
      select: { name: true },
    });

    const inviter = await db.user.findUnique({
      where: { id: access.session.userId },
      select: { fullName: true, email: true },
    });

    const inviteUrl = `${getAppBaseUrl()}/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    let emailSent = true;
    let warning: string | undefined;

    try {
      await sendOrganizationInviteEmail({
        to: email,
        organizationName: organization?.name ?? "your organization",
        inviterName: inviter?.fullName ?? inviter?.email,
        inviteUrl,
        expiresAt,
      });
    } catch {
      emailSent = false;
      warning = "Invite created, but email could not be sent. Share the invite URL manually.";
    }

    return NextResponse.json({
      invite,
      emailSent,
      warning,
      inviteUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const inviteId = String((body as { inviteId?: string }).inviteId ?? "").trim();

    if (!inviteId) {
      return NextResponse.json({ error: "inviteId is required." }, { status: 400 });
    }

    const updated = await inviteDelegate.organizationInvite.updateMany({
      where: {
        id: inviteId,
        organizationId: access.organizationId,
        status: "pending",
      },
      data: {
        status: "revoked",
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
