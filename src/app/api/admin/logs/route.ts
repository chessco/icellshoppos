import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const logs = await db.auditLog.findMany({
      include: {
        actorUser: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      logs: logs.map((log) => ({
        ...log,
        user: log.actorUser,
        details:
          typeof (log.meta as { details?: unknown } | null)?.details === "string"
            ? ((log.meta as { details?: string }).details ?? null)
            : log.meta
            ? JSON.stringify(log.meta)
            : null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
