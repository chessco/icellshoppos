import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const saleId = String((body as Record<string, unknown>).saleId ?? "").trim();

    if (!saleId || !saleId.startsWith("PR-")) {
      return NextResponse.json({ error: "Invalid purchase order ID" }, { status: 400 });
    }

    const candidates = await db.purchaseRequest.findMany({
      where: {
        organizationId: membership.organizationId,
        status: "pending",
      },
      select: {
        id: true,
        payload: true,
      },
    });

    const matched = candidates.find((record) => {
      const payload = isRecord(record.payload) ? record.payload : null;
      return String(payload?.saleId ?? "").trim() === saleId;
    });

    if (!matched) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    await db.purchaseRequest.update({
      where: { id: matched.id },
      data: { status: "completed" },
    });

    return NextResponse.json({
      success: true,
      message: `Completed purchase order ${saleId}`,
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
