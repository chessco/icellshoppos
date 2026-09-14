import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, Math.floor(limitParam))) : 50;

    const rows = await db.imeiCheck2RequestLog.findMany({
      where: { organizationId: access.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        serviceId: true,
        imei: true,
        imeisJson: true,
        orderId: true,
        status: true,
        charged: true,
        balance: true,
        responseJson: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      history: rows.map((row) => ({
        id: row.id,
        serviceId: row.serviceId,
        imei: row.imei,
        imeis: Array.isArray(row.imeisJson) ? row.imeisJson : null,
        orderId: row.orderId,
        status: row.status,
        charged: row.charged === null ? null : Number(row.charged),
        balance: row.balance === null ? null : Number(row.balance),
        response: row.responseJson,
        createdAt: row.createdAt.toISOString(),
      })),
    });
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
