import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

const toMonth = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const planFilter = searchParams.get("plan")?.trim().toLowerCase() || "";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) dateFilter.gte = parsed;
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) dateFilter.lte = parsed;
    }

    const latestSubscriptions = await db.subscription.findMany({
      distinct: ["organizationId"],
      orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
      include: { plan: { select: { code: true, name: true } } },
    });

    const orgPlanById = new Map(
      latestSubscriptions.map((item) => [
        item.organizationId,
        { code: item.plan?.code ?? "unknown", name: item.plan?.name ?? "Unknown" },
      ])
    );

    const filteredOrgIds = planFilter
      ? Array.from(orgPlanById.entries())
          .filter(([, plan]) => plan.code.toLowerCase() === planFilter)
          .map(([organizationId]) => organizationId)
      : [];

    const payments = await db.payment.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        ...(planFilter ? { organizationId: { in: filteredOrgIds } } : {}),
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const successfulPayments = payments.filter((payment) => {
      const status = payment.status.toLowerCase();
      return status === "paid" || status === "succeeded" || status === "success";
    });

    const byPlanMap = new Map<string, { plan: string; revenueCents: number; payments: number }>();
    const byMonthMap = new Map<string, { month: string; revenueCents: number; payments: number }>();

    let totalRevenueCents = 0;
    for (const payment of successfulPayments) {
      totalRevenueCents += payment.amountCents;

      const month = toMonth(payment.createdAt);
      const monthEntry = byMonthMap.get(month) ?? { month, revenueCents: 0, payments: 0 };
      monthEntry.revenueCents += payment.amountCents;
      monthEntry.payments += 1;
      byMonthMap.set(month, monthEntry);

      const plan = orgPlanById.get(payment.organizationId) ?? { code: "unknown", name: "Unknown" };
      const planEntry = byPlanMap.get(plan.code) ?? { plan: plan.name, revenueCents: 0, payments: 0 };
      planEntry.revenueCents += payment.amountCents;
      planEntry.payments += 1;
      byPlanMap.set(plan.code, planEntry);
    }

    const paymentRows = successfulPayments.slice(0, 100).map((payment) => {
      const plan = orgPlanById.get(payment.organizationId) ?? { code: "unknown", name: "Unknown" };
      return {
        id: payment.id,
        createdAt: payment.createdAt.toISOString(),
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        organizationName: payment.organization.name,
        planName: plan.name,
      };
    });

    return NextResponse.json({
      totals: {
        revenueCents: totalRevenueCents,
        successfulPayments: successfulPayments.length,
      },
      byPlan: Array.from(byPlanMap.values()).sort((a, b) => b.revenueCents - a.revenueCents),
      byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      payments: paymentRows,
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
