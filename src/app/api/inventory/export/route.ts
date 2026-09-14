import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIso = (value: Date | null | undefined): string => {
  if (!value) return "";
  return value.toISOString();
};

const parseDateQuery = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export async function GET(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
    const fromDate = parseDateQuery(searchParams.get("from"));
    const toDateRaw = parseDateQuery(searchParams.get("to"));
    const toDate = toDateRaw ? new Date(toDateRaw.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
    const exportAllOrganizations =
      access.session.isSuperadmin &&
      ["1", "true", "yes"].includes((searchParams.get("allOrganizations") ?? "").toLowerCase());

    const where: Record<string, unknown> = {};
    if (!exportAllOrganizations) {
      where.organizationId = access.organizationId;
    }
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const inventoryItems = await db.inventoryItem.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        site: { select: { id: true, name: true, status: true } },
        supplier: { select: { id: true, name: true, status: true } },
        deviceType: { select: { id: true, name: true } },
        saleItems: {
          include: {
            sale: {
              select: {
                id: true,
                saleNumber: true,
                createdAt: true,
                paymentMethod: true,
                total: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = inventoryItems.map((item) => {
      const linkedSales = item.saleItems
        .map((saleItem) => saleItem.sale)
        .filter((sale): sale is NonNullable<typeof sale> => Boolean(sale));

      const latestSale = linkedSales.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];

      const saleNumbers = linkedSales.map((sale) => sale.saleNumber).join(", ");
      const saleIds = linkedSales.map((sale) => sale.id).join(", ");

      return {
        id: item.id,
        organizationId: item.organizationId,
        organizationName: item.organization.name,
        organizationSlug: item.organization.slug,
        siteId: item.siteId,
        siteName: item.site?.name ?? "",
        siteStatus: item.site?.status ?? "",
        supplierId: item.supplierId ?? "",
        supplierName: item.supplier?.name ?? "",
        supplierStatus: item.supplier?.status ?? "",
        deviceTypeId: item.deviceTypeId ?? "",
        deviceTypeName: item.deviceType?.name ?? "",
        imei: item.imei ?? "",
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        carrier: item.carrier ?? "",
        condition: item.condition ?? "",
        grade: item.grade ?? "",
        status: item.status,
        costCurrency: item.costCurrency,
        costUsd: toNumber(item.costUsd),
        usdToPesosRate: toNumber(item.usdToPesosRate),
        costPesos: toNumber(item.costPesos),
        price: toNumber(item.price),
        price2: toNumber(item.price2),
        price3: toNumber(item.price3),
        dateOfPurchase: toIso(item.dateOfPurchase),
        batteryHealth: item.batteryHealth ?? "",
        cycleCount: item.cycleCount ?? null,
        iosVersion: item.iosVersion ?? "",
        serialNumber: item.serialNumber ?? "",
        comments: item.comments ?? "",
        qrRaw: item.qrRaw ?? "",
        createdAt: toIso(item.createdAt),
        updatedAt: toIso(item.updatedAt),
        linkedSaleCount: linkedSales.length,
        linkedSaleIds: saleIds,
        linkedSaleNumbers: saleNumbers,
        latestSaleId: latestSale?.id ?? "",
        latestSaleNumber: latestSale?.saleNumber ?? "",
        latestSaleCreatedAt: toIso(latestSale?.createdAt),
        latestSalePaymentMethod: latestSale?.paymentMethod ?? "",
        latestSaleTotal: latestSale ? toNumber(latestSale.total) : null,
        latestSaleCustomerId: latestSale?.customer?.id ?? "",
        latestSaleCustomerName: latestSale?.customer?.name ?? "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "FullInventory");

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const scopeSuffix = exportAllOrganizations ? "all-orgs" : "current-org";

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const fileName = `full-inventory-${scopeSuffix}-${dateSuffix}.csv`;
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const fileBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true,
    }) as Buffer;

    const fileName = `full-inventory-${scopeSuffix}-${dateSuffix}.xlsx`;

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export inventory" },
      { status: 500 }
    );
  }
}
