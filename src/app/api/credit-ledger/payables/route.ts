import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;

    const memberships = await db.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    const emailSet = new Set<string>();
    memberships.forEach((membership) => {
      const normalized = membership.user.email.trim().toLowerCase();
      if (normalized) {
        emailSet.add(normalized);
      }
    });

    const memberEmails = Array.from(emailSet);

    if (memberEmails.length === 0) {
      return NextResponse.json({ payables: [] });
    }

    const linkedCustomers = await db.customer.findMany({
      where: {
        organizationId: { not: organizationId },
        email: {
          in: memberEmails,
          mode: "insensitive",
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        creditLedger: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            type: true,
            amount: true,
            note: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
      },
    });

    const payables = linkedCustomers
      .map((customer) => {
        const entries = customer.creditLedger.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: Number(entry.amount),
          note: entry.note,
          paymentMethod: entry.paymentMethod,
          createdAt: entry.createdAt.toISOString(),
        }));

        const balance = entries.reduce((sum, entry) => sum + entry.amount, 0);

        return {
          orgId: customer.organization.id,
          orgName: customer.organization.name,
          customerName: customer.name,
          customerEmail: customer.email,
          balance,
          entries,
        };
      })
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    return NextResponse.json({ payables });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
