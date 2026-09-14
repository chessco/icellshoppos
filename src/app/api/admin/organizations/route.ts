import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizations = await db.organization.findMany({
      include: {
        subscriptions: {
          include: {
            plan: true,
            items: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ organizations });
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
