import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

const toNumber = (value: unknown) => {
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString()) || 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const dateKey = (date: Date) => startOfDay(date).toISOString().slice(0, 10);

const parseDateInput = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseCustomerTypeFilter = (value: string | null): "all" | "retail" | "wholesale" => {
  if (value === "retail" || value === "wholesale") return value;
  return "all";
};

const isAvailableStatus = (status: string) => {
  const normalized = status.trim().toLowerCase();
  return normalized === "available";
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organizationId = membership.organizationId;

    const now = new Date();
    const defaultFrom = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    const defaultTo = endOfDay(now);
    const requestFrom = parseDateInput(request.nextUrl.searchParams.get("from"));
    const requestTo = parseDateInput(request.nextUrl.searchParams.get("to"));
    const customerTypeFilter = parseCustomerTypeFilter(request.nextUrl.searchParams.get("customerType"));

    let rangeFrom = requestFrom ? startOfDay(requestFrom) : defaultFrom;
    let rangeTo = requestTo ? endOfDay(requestTo) : defaultTo;

    if (rangeFrom.getTime() > rangeTo.getTime()) {
      [rangeFrom, rangeTo] = [startOfDay(rangeTo), endOfDay(rangeFrom)];
    }

    const saleWhere = {
      organizationId,
      ...(customerTypeFilter !== "all"
        ? {
            customer: {
              customerType: customerTypeFilter,
            },
          }
        : {}),
    };

    const [
      inventoryItems,
      soldAgg,
      salesSummary,
      salesLast30,
      salesRangeItems,
      salesByCustomerRaw,
      salesByCustomerItems,
      salesRangeByType,
      salesRangeByTypeItems,
      salesLineDetails,
      topModelsRaw,
      statusRaw,
    ] = await Promise.all([
      db.inventoryItem.findMany({
        where: { organizationId },
        select: {
          status: true,
          costPesos: true,
          price: true,
          price2: true,
          price3: true,
          createdAt: true,
          dateOfPurchase: true,
        },
      }),
      db.saleItem.aggregate({
        where: { sale: saleWhere },
        _sum: { salePrice: true, cost: true },
        _count: { _all: true },
      }),
      db.sale.aggregate({
        where: saleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.sale.findMany({
        where: {
          ...saleWhere,
          createdAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: {
          createdAt: true,
          total: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.saleItem.findMany({
        where: {
          sale: {
            ...saleWhere,
            createdAt: { gte: rangeFrom, lte: rangeTo },
          },
        },
        select: {
          salePrice: true,
          cost: true,
          sale: {
            select: {
              createdAt: true,
            },
          },
        },
      }),
      db.sale.groupBy({
        by: ["customerId"],
        where: saleWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.saleItem.findMany({
        where: { sale: saleWhere },
        select: {
          salePrice: true,
          cost: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
      }),
      db.sale.findMany({
        where: {
          ...saleWhere,
          createdAt: { gte: rangeFrom, lte: rangeTo },
        },
        select: {
          id: true,
          total: true,
          customer: {
            select: {
              customerType: true,
            },
          },
        },
      }),
      db.saleItem.findMany({
        where: {
          sale: {
            ...saleWhere,
            createdAt: { gte: rangeFrom, lte: rangeTo },
          },
        },
        select: {
          salePrice: true,
          cost: true,
          sale: {
            select: {
              customer: {
                select: {
                  customerType: true,
                },
              },
            },
          },
        },
      }),
      db.saleItem.findMany({
        where: {
          sale: {
            ...saleWhere,
            createdAt: { gte: rangeFrom, lte: rangeTo },
          },
        },
        select: {
          imei: true,
          model: true,
          capacity: true,
          color: true,
          salePrice: true,
          cost: true,
          sale: {
            select: {
              saleNumber: true,
              createdAt: true,
              customer: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          sale: {
            createdAt: "desc",
          },
        },
      }),
      db.saleItem.groupBy({
        by: ["model"],
        where: { sale: saleWhere },
        _sum: { salePrice: true, cost: true },
        _count: { _all: true },
      }),
      db.inventoryItem.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);

    const customerIds = salesByCustomerRaw
      .map((item) => item.customerId)
      .filter((item): item is string => Boolean(item));

    const customers = customerIds.length
      ? await db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [];

    const customerNameById = new Map(customers.map((item) => [item.id, item.name] as const));

    const availableItems = inventoryItems.filter((item) => isAvailableStatus(item.status));
    const nonDeletedItems = inventoryItems.filter(
      (item) => item.status.trim().toLowerCase() !== "deleted"
    );
    const soldInventoryItems = inventoryItems.filter(
      (item) => item.status.trim().toLowerCase() === "sold"
    );

    const availableUnits = availableItems.length;
    const totalInventoryUnits = inventoryItems.length;
    const soldUnits = soldAgg._count._all;

    const inventoryCost = availableItems.reduce((sum, item) => sum + toNumber(item.costPesos), 0);
    const inventoryPotential = availableItems.reduce((sum, item) => sum + toNumber(item.price), 0);

    const soldRevenue = toNumber(soldAgg._sum.salePrice);
    const soldCost = toNumber(soldAgg._sum.cost);
    const grossProfit = soldRevenue - soldCost;

    const availableInventoryCost = Math.round(
      availableItems.reduce((sum, item) => sum + toNumber(item.costPesos), 0)
    );

    const tierScenarios = {
      price: {
        label: "Price",
        availableInventoryCost,
        availableProjectedRevenue: Math.round(
          availableItems.reduce((sum, item) => sum + toNumber(item.price), 0)
        ),
      },
      price2: {
        label: "Price 2",
        availableInventoryCost,
        availableProjectedRevenue: Math.round(
          availableItems.reduce((sum, item) => sum + toNumber(item.price2), 0)
        ),
      },
      price3: {
        label: "Price 3",
        availableInventoryCost,
        availableProjectedRevenue: Math.round(
          availableItems.reduce((sum, item) => sum + toNumber(item.price3), 0)
        ),
      },
    };

    const sellThroughRate =
      soldUnits + availableUnits > 0
        ? (soldUnits / (soldUnits + availableUnits)) * 100
        : 0;

    const salesByDateMap = new Map<string, { revenue: number; orders: number; profit: number }>();
    const totalRangeDays = Math.max(
      1,
      Math.round((startOfDay(rangeTo).getTime() - startOfDay(rangeFrom).getTime()) / (24 * 60 * 60 * 1000)) + 1
    );

    for (let index = 0; index < totalRangeDays; index += 1) {
      const current = new Date(startOfDay(rangeFrom).getTime() + index * 24 * 60 * 60 * 1000);
      salesByDateMap.set(dateKey(current), { revenue: 0, orders: 0, profit: 0 });
    }

    for (const sale of salesLast30) {
      const key = dateKey(sale.createdAt);
      const existing = salesByDateMap.get(key);
      if (!existing) continue;
      existing.revenue += toNumber(sale.total);
      existing.orders += 1;
    }

    for (const item of salesRangeItems) {
      const key = dateKey(item.sale.createdAt);
      const existing = salesByDateMap.get(key);
      if (!existing) continue;
      existing.profit += toNumber(item.salePrice) - toNumber(item.cost);
    }

    const salesByDate = Array.from(salesByDateMap.entries()).map(([date, totals]) => {
      const dateObject = new Date(date);
      const label = `${dateObject.getMonth() + 1}/${dateObject.getDate()}`;
      return {
        date,
        label,
        revenue: Math.round(totals.revenue),
        orders: totals.orders,
        profit: Math.round(totals.profit),
      };
    });

    const salesRangeSummary = salesByDate.reduce(
      (sum, point) => ({
        revenue: sum.revenue + point.revenue,
        profit: sum.profit + point.profit,
        orders: sum.orders + point.orders,
      }),
      { revenue: 0, profit: 0, orders: 0 }
    );

    const walkInCustomerKey = "__walk_in__";
    const customerProfitById = new Map<string, number>();
    for (const saleItem of salesByCustomerItems) {
      const key = saleItem.sale.customerId ?? walkInCustomerKey;
      const current = customerProfitById.get(key) ?? 0;
      customerProfitById.set(key, current + toNumber(saleItem.salePrice) - toNumber(saleItem.cost));
    }

    const salesByCustomer = salesByCustomerRaw
      .map((item) => {
        const key = item.customerId ?? walkInCustomerKey;
        const revenue = toNumber(item._sum.total);
        const profit = customerProfitById.get(key) ?? 0;
        return {
          customer:
            item.customerId && customerNameById.get(item.customerId)
              ? customerNameById.get(item.customerId)
              : "Walk-in / Unassigned",
          revenue,
          orders: item._count._all,
          profit,
          marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        revenue: Math.round(item.revenue),
        profit: Math.round(item.profit),
        marginPercent: Math.round(item.marginPercent * 10) / 10,
      }));

    const marginByDate = salesByDate.map((point) => ({
      date: point.date,
      label: point.label,
      margin: point.profit,
      revenue: point.revenue,
    }));

    const customerTypeMixMap = new Map<string, { type: "retail" | "wholesale" | "walk_in"; revenue: number; profit: number; orders: number }>([
      ["retail", { type: "retail", revenue: 0, profit: 0, orders: 0 }],
      ["wholesale", { type: "wholesale", revenue: 0, profit: 0, orders: 0 }],
      ["walk_in", { type: "walk_in", revenue: 0, profit: 0, orders: 0 }],
    ]);

    for (const sale of salesRangeByType) {
      const key = sale.customer?.customerType === "wholesale" ? "wholesale" : sale.customer?.customerType === "retail" ? "retail" : "walk_in";
      const entry = customerTypeMixMap.get(key);
      if (!entry) continue;
      entry.revenue += toNumber(sale.total);
      entry.orders += 1;
    }

    for (const item of salesRangeByTypeItems) {
      const key = item.sale.customer?.customerType === "wholesale" ? "wholesale" : item.sale.customer?.customerType === "retail" ? "retail" : "walk_in";
      const entry = customerTypeMixMap.get(key);
      if (!entry) continue;
      entry.profit += toNumber(item.salePrice) - toNumber(item.cost);
    }

    const customerTypeMix = Array.from(customerTypeMixMap.values()).map((entry) => ({
      ...entry,
      revenue: Math.round(entry.revenue),
      profit: Math.round(entry.profit),
      marginPercent: entry.revenue > 0 ? Math.round(((entry.profit / entry.revenue) * 100) * 10) / 10 : 0,
    }));

    const customerLineDetails = salesLineDetails.map((line) => {
      const cost = toNumber(line.cost);
      const salePrice = toNumber(line.salePrice);
      return {
        customer: line.sale.customer?.name ?? "Walk-in / Unassigned",
        saleNumber: line.sale.saleNumber,
        soldAt: line.sale.createdAt.toISOString(),
        imei: line.imei,
        model: line.model,
        capacity: line.capacity,
        color: line.color,
        cost: Math.round(cost),
        salePrice: Math.round(salePrice),
        margin: Math.round(salePrice - cost),
      };
    });

    const topModels = topModelsRaw
      .map((item) => ({
        model: item.model || "Unknown",
        units: item._count._all,
        revenue: Math.round(toNumber(item._sum.salePrice)),
        profit: Math.round(toNumber(item._sum.salePrice) - toNumber(item._sum.cost)),
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8);

    const inventoryByStatus = statusRaw
      .map((item) => ({
        status: item.status || "Unknown",
        count: item._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const agingBuckets = [
      { bucket: "0-30 days", min: 0, max: 30, count: 0 },
      { bucket: "31-60 days", min: 31, max: 60, count: 0 },
      { bucket: "61-90 days", min: 61, max: 90, count: 0 },
      { bucket: "90+ days", min: 91, max: Number.POSITIVE_INFINITY, count: 0 },
    ];

    for (const item of availableItems) {
      const baseDate = item.dateOfPurchase ?? item.createdAt;
      const diffDays = Math.max(
        0,
        Math.floor((startOfDay(now).getTime() - startOfDay(baseDate).getTime()) / (1000 * 60 * 60 * 24))
      );

      const bucket = agingBuckets.find((entry) => diffDays >= entry.min && diffDays <= entry.max);
      if (bucket) bucket.count += 1;
    }

    const bestSalesDay = [...salesByDate].sort((a, b) => b.revenue - a.revenue)[0];
    const topCustomer = salesByCustomer[0];
    const bestModel = topModels[0];

    return NextResponse.json({
      metrics: {
        totalInventoryUnits,
        availableUnits,
        soldUnits,
        inventoryCost: Math.round(inventoryCost),
        inventoryPotential: Math.round(inventoryPotential),
        soldRevenue: Math.round(soldRevenue),
        soldCost: Math.round(soldCost),
        grossProfit: Math.round(grossProfit),
        ordersCount: salesSummary._count._all,
        averageTicket:
          salesSummary._count._all > 0
            ? Math.round(toNumber(salesSummary._sum.total) / salesSummary._count._all)
            : 0,
        sellThroughRate: Math.round(sellThroughRate * 10) / 10,
      },
      salesByDate,
      marginByDate,
      customerTypeMix,
      customerLineDetails,
      salesRangeSummary: {
        from: rangeFrom.toISOString().slice(0, 10),
        to: rangeTo.toISOString().slice(0, 10),
        revenue: Math.round(salesRangeSummary.revenue),
        profit: Math.round(salesRangeSummary.profit),
        orders: salesRangeSummary.orders,
      },
      salesByCustomer,
      topModels,
      inventoryByStatus,
      inventoryAging: agingBuckets.map((item) => ({ bucket: item.bucket, count: item.count })),
      tierScenarios,
      insights: {
        bestSalesDay: bestSalesDay?.label ?? "-",
        bestSalesDayRevenue: bestSalesDay?.revenue ?? 0,
        topCustomer: topCustomer?.customer ?? "-",
        topCustomerRevenue: topCustomer?.revenue ?? 0,
        topModel: bestModel?.model ?? "-",
        topModelUnits: bestModel?.units ?? 0,
      },
      appliedFilters: {
        customerType: customerTypeFilter,
      },
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
