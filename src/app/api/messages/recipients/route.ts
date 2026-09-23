import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Fetch team members
    const teamMemberships = await db.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    const teamUsers = teamMemberships
      .map((m) => ({
        id: m.user.id,
        name: m.user.fullName || m.user.email.split("@")[0],
        email: m.user.email,
        role: m.role.toUpperCase(),
      }))
      .filter((u) => u.id !== session.userId);

    // 2. Fetch customers with phone/whatsapp
    const customers = await db.customer.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true, whatsapp: true, email: true, customerType: true },
      orderBy: { name: "asc" },
      take: 100,
    });

    const repairCustomers = await db.repairCustomer.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true, whatsapp: true, email: true },
      orderBy: { name: "asc" },
      take: 50,
    });

    const clientMap = new Map<string, any>();

    for (const c of customers) {
      clientMap.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.whatsapp,
        email: c.email,
        type: c.customerType,
      });
    }

    for (const rc of repairCustomers) {
      if (!clientMap.has(rc.id)) {
        clientMap.set(rc.id, {
          id: rc.id,
          name: rc.name,
          phone: rc.whatsapp,
          email: rc.email,
          type: "repair",
        });
      }
    }

    return NextResponse.json({
      teamUsers,
      clients: Array.from(clientMap.values()),
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
