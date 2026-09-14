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
    const organizationId = searchParams.get("organizationId")?.trim() || "";

    const sales = await db.sale.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: {
        organization: { select: { id: true, name: true } },
        customer: true,
        items: {
          include: {
            inventoryItem: {
              select: {
                serialNumber: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const latestSubscriptions = await db.subscription.findMany({
      distinct: ["organizationId"],
      orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
      include: { plan: { select: { code: true, name: true } } },
    });
    const orgPlanMap = new Map(
      latestSubscriptions.map((item) => [
        item.organizationId,
        { code: item.plan?.code ?? "unknown", name: item.plan?.name ?? "Unknown" },
      ])
    );

    const salesByOrganizationMap = new Map<string, { organization: string; revenue: number; orders: number }>();
    const salesByMonthMap = new Map<string, { month: string; revenue: number; orders: number }>();
    const salesByPlanMap = new Map<string, { plan: string; revenue: number; orders: number }>();

    for (const sale of sales) {
      const revenue = sale.items.reduce((sum, item) => sum + Number(item.salePrice), 0);

      const orgEntry = salesByOrganizationMap.get(sale.organization.name) ?? {
        organization: sale.organization.name,
        revenue: 0,
        orders: 0,
      };
      orgEntry.revenue += revenue;
      orgEntry.orders += 1;
      salesByOrganizationMap.set(sale.organization.name, orgEntry);

      const month = toMonth(sale.createdAt);
      const monthEntry = salesByMonthMap.get(month) ?? { month, revenue: 0, orders: 0 };
      monthEntry.revenue += revenue;
      monthEntry.orders += 1;
      salesByMonthMap.set(month, monthEntry);

      const orgPlan = orgPlanMap.get(sale.organizationId) ?? { code: "unknown", name: "Unknown" };
      const planEntry = salesByPlanMap.get(orgPlan.code) ?? { plan: orgPlan.name, revenue: 0, orders: 0 };
      planEntry.revenue += revenue;
      planEntry.orders += 1;
      salesByPlanMap.set(orgPlan.code, planEntry);
    }

    const payloadSales = sales.map((sale) => ({
      saleId: sale.saleNumber,
      soldAt: sale.createdAt.toISOString(),
      organizationName: sale.organization.name,
      customer: sale.customer?.name ?? "",
      customerType:
        (sale.customer as { customerType?: "retail" | "wholesale" } | null)?.customerType ??
        "retail",
      customerEmail: sale.customer?.email ?? "",
      customerWhatsapp: sale.customer?.whatsapp ?? "",
      paymentMethod: sale.paymentMethod ?? "",
      notes: sale.notes ?? "",
      soldBy: sale.soldBy ?? "",
      lines: sale.items.map((item) => ({
        id: item.id,
        imei: item.imei,
        serialNumber: item.inventoryItem?.serialNumber ?? "",
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        costPesos: item.cost.toString(),
        salePrice: item.salePrice.toString(),
        marginPesos: Number(item.salePrice) - Number(item.cost),
        status: item.status,
      })),
    }));

    return NextResponse.json({
      sales: payloadSales,
      salesByOrganization: Array.from(salesByOrganizationMap.values()).sort((a, b) => b.revenue - a.revenue),
      salesByMonth: Array.from(salesByMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      salesByPlan: Array.from(salesByPlanMap.values()).sort((a, b) => b.revenue - a.revenue),
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
