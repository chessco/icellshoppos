import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";
import { logAudit } from "@/lib/audit-log";
import type { SubscriptionStatus } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden: Superadmin access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { organizationId, planId, status, currentPeriodEnd, trialEndsAt } = body;

    if (!organizationId || !planId) {
      return NextResponse.json(
        { error: "organizationId and planId are required" },
        { status: 400 }
      );
    }

    // Verify organization exists
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Verify plan exists
    const plan = await db.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const targetStatus: SubscriptionStatus =
      status === "trialing" || status === "active" || status === "past_due" || status === "canceled"
        ? status
        : "active";

    const now = new Date();
    let periodEnd: Date | null = null;
    let trialEnd: Date | null = null;

    if (targetStatus === "trialing") {
      trialEnd = trialEndsAt
        ? new Date(trialEndsAt)
        : new Date(now.getTime() + (plan.trialDays || 14) * 24 * 60 * 60 * 1000);
      periodEnd = trialEnd;
    } else {
      // For active, default to 1 year or custom date
      periodEnd = currentPeriodEnd
        ? new Date(currentPeriodEnd)
        : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    }

    // Upsert subscription
    const existingSub = await db.subscription.findUnique({
      where: { organizationId },
    });

    let subscription;
    if (existingSub) {
      subscription = await db.subscription.update({
        where: { organizationId },
        data: {
          planId: plan.id,
          status: targetStatus,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        include: {
          plan: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      });
    } else {
      subscription = await db.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          status: targetStatus,
          trialEndsAt: trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        include: {
          plan: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      });
    }

    // Audit log
    try {
      const actorExists = session.userId
        ? await db.user.findUnique({ where: { id: session.userId }, select: { id: true } })
        : null;

      await logAudit({
        organizationId,
        actorUserId: actorExists ? session.userId : null,
        action: "SUPERADMIN_UPGRADE_SUBSCRIPTION_PLAN",
        entity: "Subscription",
        entityId: subscription.id,
        meta: {
          previousPlanId: existingSub?.planId || null,
          newPlanId: plan.id,
          planCode: plan.code,
          planName: plan.name,
          status: targetStatus,
          upgradedByEmail: session.email,
          upgradedByUserId: session.userId,
        },
      });
    } catch (auditErr) {
      console.warn("[Superadmin Upgrade] Failed to write audit log:", auditErr);
    }

    return NextResponse.json({
      success: true,
      message: `Organization '${organization.name}' successfully updated to plan '${plan.name}' (${targetStatus}).`,
      subscription,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[Superadmin Upgrade] Error updating plan:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
