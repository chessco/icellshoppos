import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

type MonthlyBucket = {
  month: string;
  amountCents: number;
  count: number;
};

const toMonthKey = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      organizations,
      users,
      subscriptions,
      plans,
      payments,
    ] = await Promise.all([
      db.organization.findMany({ select: { id: true, status: true, createdAt: true } }),
      db.user.findMany({ select: { id: true, status: true, createdAt: true } }),
      db.subscription.findMany({
        select: {
          id: true,
          status: true,
          planId: true,
          organizationId: true,
          createdAt: true,
        },
      }),
      db.plan.findMany({
        select: { id: true, code: true, name: true, basePriceCents: true },
      }),
      db.payment.findMany({
        select: {
          id: true,
          amountCents: true,
          status: true,
          createdAt: true,
          organizationId: true,
          currency: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    const activeUsers = users.filter((user) => user.status === "active").length;
    const inactiveUsers = users.length - activeUsers;
    const activeOrganizations = organizations.filter((org) => org.status === "active").length;
    const suspendedOrganizations = organizations.filter((org) => org.status !== "active").length;

    const planById = new Map(plans.map((plan) => [plan.id, plan]));

    const subscriptionsByPlan = plans.map((plan) => {
      const matched = subscriptions.filter((subscription) => subscription.planId === plan.id);
      const activeCount = matched.filter((subscription) => subscription.status === "active").length;
      const trialingCount = matched.filter((subscription) => subscription.status === "trialing").length;
      return {
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        activeCount,
        trialingCount,
        mrrCents: activeCount * plan.basePriceCents,
      };
    });

    const monthlyMap = new Map<string, MonthlyBucket>();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      const key = toMonthKey(payment.createdAt);
      const existing = monthlyMap.get(key) ?? { month: key, amountCents: 0, count: 0 };
      existing.amountCents += payment.amountCents;
      existing.count += 1;
      monthlyMap.set(key, existing);
    }

    const revenueByMonth = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    const orgPlanMap = new Map<string, { code: string; name: string }>();
    for (const subscription of subscriptions) {
      const plan = planById.get(subscription.planId);
      if (!plan) continue;
      orgPlanMap.set(subscription.organizationId, { code: plan.code, name: plan.name });
    }

    const revenueByPlanMap = new Map<string, { planCode: string; planName: string; amountCents: number; count: number }>();
    for (const payment of payments) {
      if (payment.status !== "succeeded") continue;
      const fallback = { code: "unknown", name: "Unknown" };
      const plan = orgPlanMap.get(payment.organizationId) ?? fallback;
      const key = plan.code;
      const existing = revenueByPlanMap.get(key) ?? {
        planCode: plan.code,
        planName: plan.name,
        amountCents: 0,
        count: 0,
      };
      existing.amountCents += payment.amountCents;
      existing.count += 1;
      revenueByPlanMap.set(key, existing);
    }

    const revenueByPlan = Array.from(revenueByPlanMap.values()).sort((a, b) => b.amountCents - a.amountCents);

    const now = Date.now();
    const newUsersLast30Days = users.filter((user) => now - user.createdAt.getTime() <= 1000 * 60 * 60 * 24 * 30).length;
    const newOrganizationsLast30Days = organizations.filter((org) => now - org.createdAt.getTime() <= 1000 * 60 * 60 * 24 * 30).length;

    return NextResponse.json({
      metrics: {
        usersTotal: users.length,
        usersActive: activeUsers,
        usersInactive: inactiveUsers,
        organizationsTotal: organizations.length,
        organizationsActive: activeOrganizations,
        organizationsSuspended: suspendedOrganizations,
        subscriptionsTotal: subscriptions.length,
        mrrCents: subscriptionsByPlan.reduce((sum, item) => sum + item.mrrCents, 0),
        newUsersLast30Days,
        newOrganizationsLast30Days,
      },
      subscriptionsByPlan,
      revenueByMonth,
      revenueByPlan,
      latestPayments: payments.slice(0, 20),
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
