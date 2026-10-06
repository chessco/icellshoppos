import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [users, plans, organizations] = await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          createdAt: true,
          memberships: {
            select: {
              id: true,
              role: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  subscriptions: {
                    select: {
                      id: true,
                      status: true,
                      planId: true,
                      plan: {
                        select: {
                          id: true,
                          code: true,
                          name: true,
                          basePriceCents: true,
                        },
                      },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.plan.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          basePriceCents: true,
          includedSeats: true,
          trialDays: true,
        },
        orderBy: { basePriceCents: "asc" },
      }),
      db.organization.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          subscriptions: {
            select: {
              id: true,
              status: true,
              planId: true,
              plan: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  basePriceCents: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { memberships: true },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const orgDetails: Record<
      string,
      {
        id: string;
        name: string;
        slug: string;
        userCount: number;
        planId: string | null;
        planCode: string | null;
        planName: string | null;
        planPriceCents: number | null;
        subscriptionStatus: string | null;
      }
    > = {};

    for (const org of organizations) {
      const activeSub = org.subscriptions[0] || null;
      orgDetails[org.id] = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        userCount: org._count.memberships,
        planId: activeSub?.planId || activeSub?.plan?.id || null,
        planCode: activeSub?.plan?.code || "free",
        planName: activeSub?.plan?.name || "Free Trial",
        planPriceCents: activeSub?.plan?.basePriceCents ?? 0,
        subscriptionStatus: activeSub?.status || "trialing",
      };
    }

    const groupedByOrganization: Record<
      string,
      {
        orgId: string;
        orgName: string;
        planName: string;
        planCode: string;
        planId: string | null;
        subscriptionStatus: string;
        users: Array<{ id: string; fullName: string | null; email: string; status: string; role: string }>;
      }
    > = {};

    for (const org of organizations) {
      const activeSub = org.subscriptions[0] || null;
      groupedByOrganization[org.name] = {
        orgId: org.id,
        orgName: org.name,
        planName: activeSub?.plan?.name || "Free Trial",
        planCode: activeSub?.plan?.code || "free",
        planId: activeSub?.planId || activeSub?.plan?.id || null,
        subscriptionStatus: activeSub?.status || "trialing",
        users: [],
      };
    }

    for (const user of users) {
      for (const membership of user.memberships) {
        const organizationName = membership.organization?.name ?? "Unknown";
        if (!groupedByOrganization[organizationName]) {
          const activeSub = membership.organization?.subscriptions[0] || null;
          groupedByOrganization[organizationName] = {
            orgId: membership.organization?.id || "",
            orgName: organizationName,
            planName: activeSub?.plan?.name || "Free Trial",
            planCode: activeSub?.plan?.code || "free",
            planId: activeSub?.planId || activeSub?.plan?.id || null,
            subscriptionStatus: activeSub?.status || "trialing",
            users: [],
          };
        }
        groupedByOrganization[organizationName].users.push({
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          status: user.status,
          role: membership.role,
        });
      }
    }

    return NextResponse.json({ users, plans, organizations: orgDetails, groupedByOrganization });
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

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: "set-status" | "set-membership-role" | "set-org-plan";
      userId?: string;
      status?: "active" | "inactive";
      membershipId?: string;
      role?: "superadmin" | "admin" | "staff";
      organizationId?: string;
      planId?: string;
      subscriptionStatus?: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
    };

    if (body.action === "set-status") {
      if (!body.userId || !body.status) {
        return NextResponse.json({ error: "Missing userId or status" }, { status: 400 });
      }

      const user = await db.user.update({
        where: { id: body.userId },
        data: { status: body.status },
      });

      return NextResponse.json({ user });
    }

    if (body.action === "set-membership-role") {
      if (!body.membershipId || !body.role) {
        return NextResponse.json({ error: "Missing membershipId or role" }, { status: 400 });
      }

      const membership = await db.membership.update({
        where: { id: body.membershipId },
        data: { role: body.role },
      });

      return NextResponse.json({ membership });
    }

    if (body.action === "set-org-plan") {
      if (!body.organizationId || !body.planId) {
        return NextResponse.json({ error: "Missing organizationId or planId" }, { status: 400 });
      }

      const plan = await db.plan.findUnique({ where: { id: body.planId } });
      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      const targetStatus = body.subscriptionStatus || "active";
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const existingSub = await db.subscription.findUnique({
        where: { organizationId: body.organizationId },
      });

      let subscription;
      if (existingSub) {
        subscription = await db.subscription.update({
          where: { organizationId: body.organizationId },
          data: {
            planId: plan.id,
            status: targetStatus,
            trialEndsAt: targetStatus === "trialing" ? new Date(now.getTime() + (plan.trialDays || 14) * 86400000) : null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        });
      } else {
        subscription = await db.subscription.create({
          data: {
            organizationId: body.organizationId,
            planId: plan.id,
            status: targetStatus,
            trialEndsAt: targetStatus === "trialing" ? new Date(now.getTime() + (plan.trialDays || 14) * 86400000) : null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          include: { plan: true },
        });
      }

      return NextResponse.json({ success: true, subscription, plan });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
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
