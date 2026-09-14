import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";
import { resolveEffectivePermissions } from "@/lib/org-permissions";

const expireTrialIfNeeded = async (organizationId: string) => {
  const subscription = await db.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription || subscription.status !== "trialing" || !subscription.trialEndsAt) {
    return;
  }

  if (subscription.trialEndsAt.getTime() > Date.now()) return;

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: { status: "canceled", currentPeriodEnd: subscription.trialEndsAt },
    }),
    db.organization.update({
      where: { id: organizationId },
      data: { status: "suspended" },
    }),
  ]);
};

export async function GET(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.activeOrganizationId) {
      await expireTrialIfNeeded(session.activeOrganizationId);
    }

    const organizations = session.isSuperadmin
      ? await db.organization.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : await db.organization.findMany({
          where: {
            memberships: {
              some: {
                userId: session.userId,
              },
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
          orderBy: { createdAt: "desc" },
        });

    let permissions: Record<string, boolean> | null = null;
    if (session.activeOrganizationId) {
      const membership = await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: session.activeOrganizationId,
            userId: session.userId,
          },
        },
        select: {
          role: true,
          permissionsJson: true,
        },
      });

      if (membership) {
        permissions = resolveEffectivePermissions(
          membership.role as "superadmin" | "admin" | "staff",
          membership.permissionsJson
        );
      } else if (session.isSuperadmin) {
        permissions = resolveEffectivePermissions("superadmin", {});
      }
    }

    return NextResponse.json({
      session,
      organizations,
      permissions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
