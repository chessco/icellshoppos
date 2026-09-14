import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const plans = await db.plan.findMany({
      where: { active: true },
      orderBy: { basePriceCents: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        basePriceCents: true,
        includedSeats: true,
        extraSeatPriceCents: true,
        trialDays: true,
        active: true,
        stripePriceId: true,
      },
    });
    return NextResponse.json({ plans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
