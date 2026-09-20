import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ORG_PERMISSION_KEYS, getRequestOrgAccess, type OrgPermissionKey } from "@/lib/org-permissions";

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

    const members = await db.membership.findMany({
      where: {
        organizationId: access.organizationId,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        permissionsJson: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({ members });
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

export async function PATCH(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const membershipId = String((body as { membershipId?: string }).membershipId ?? "").trim();
    const roleInput = String((body as { role?: string }).role ?? "").trim().toLowerCase();
    const permissions = parsePermissions((body as { permissions?: unknown }).permissions);

    if (!membershipId) {
      return NextResponse.json({ error: "membershipId is required." }, { status: 400 });
    }

    if (roleInput === "superadmin") {
      return NextResponse.json({ error: "Assigning superadmin role is not permitted." }, { status: 403 });
    }

    if (!["staff", "admin"].includes(roleInput)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const target = await db.membership.findUnique({
      where: { id: membershipId },
      select: { id: true, organizationId: true, userId: true },
    });

    if (!target || target.organizationId !== access.organizationId) {
      return NextResponse.json({ error: "Membership not found." }, { status: 404 });
    }

    if (target.userId === access.session.userId && roleInput === "staff") {
      return NextResponse.json({ error: "You cannot demote your own account to staff." }, { status: 400 });
    }

    const updated = await db.membership.update({
      where: { id: membershipId },
      data: {
        role: roleInput as "admin" | "staff",
        permissionsJson: permissions,
      },
      select: {
        id: true,
        role: true,
        permissionsJson: true,
        userId: true,
      },
    });

    return NextResponse.json({ membership: updated });
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
