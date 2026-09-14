import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";
import { getStripePriceIdForPlan } from "@/lib/billing-plans";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
    const plans = await db.plan.findMany({
      where: { active: true },
      orderBy: { basePriceCents: "asc" },
    });
    return NextResponse.json({
      plans: plans.map((plan) => ({
        ...plan,
        stripePriceId: getStripePriceIdForPlan(plan.code, plan.stripePriceId),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
