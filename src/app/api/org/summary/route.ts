import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = membership.organizationId;

    const [organization, inventoryCount, salesCount, usersCount] = await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        include: {
          subscriptions: {
            include: { plan: true, items: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      db.inventoryItem.count({ where: { organizationId } }),
      db.sale.count({ where: { organizationId } }),
      db.membership.count({ where: { organizationId } }),
    ]);

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      organization,
      metrics: {
        inventoryCount,
        salesCount,
        usersCount,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
