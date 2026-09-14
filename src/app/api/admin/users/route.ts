import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const groupedByOrganization: Record<string, Array<{ id: string; fullName: string | null; email: string; status: string; role: string }>> = {};
    for (const user of users) {
      for (const membership of user.memberships) {
        const organizationName = membership.organization?.name ?? "Unknown";
        if (!groupedByOrganization[organizationName]) {
          groupedByOrganization[organizationName] = [];
        }
        groupedByOrganization[organizationName].push({
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          status: user.status,
          role: membership.role,
        });
      }
    }

    return NextResponse.json({ users, groupedByOrganization });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: "set-status" | "set-membership-role";
      userId?: string;
      status?: "active" | "inactive";
      membershipId?: string;
      role?: "superadmin" | "admin" | "staff";
    };

    if (body.action === "set-status") {
      if (!body.userId || !body.status) {
        return NextResponse.json({ error: "Missing userId or status" }, { status: 400 });
      }

      const user = await db.user.update({
        where: { id: body.userId },
        data: { status: body.status },
      });

      return NextResponse.json({ user });
    }

    if (body.action === "set-membership-role") {
      if (!body.membershipId || !body.role) {
        return NextResponse.json({ error: "Missing membershipId or role" }, { status: 400 });
      }

      const membership = await db.membership.update({
        where: { id: body.membershipId },
        data: { role: body.role },
      });

      return NextResponse.json({ membership });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
