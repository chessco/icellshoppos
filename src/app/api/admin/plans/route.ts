import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, basePriceCents, includedSeats, extraSeatPriceCents, trialDays, active } = body;
    if (!id) return NextResponse.json({ error: "Missing plan id" }, { status: 400 });
    const updated = await db.plan.update({
      where: { id },
      data: {
        name,
        code,
        basePriceCents,
        includedSeats,
        extraSeatPriceCents,
        trialDays,
        active,
      },
    });
    return NextResponse.json({ plan: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
