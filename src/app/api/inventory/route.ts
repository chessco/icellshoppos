import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

function parseDecimal(value: string | undefined | null): number | null {
  if (!value || !value.trim()) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function parseDecimalRequired(value: string | undefined | null, defaultValue: number = 0): number {
  if (!value || !value.trim()) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseCurrencyCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return "MXN";
  return code.slice(0, 8);
}

function parseDateOptional(value: string | undefined | null): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      if (numeric > 0 && numeric < 100000) {
        const excelEpochUtc = Date.UTC(1899, 11, 30);
        const parsedFromExcel = new Date(excelEpochUtc + Math.round(numeric * 24 * 60 * 60 * 1000));
        const year = parsedFromExcel.getUTCFullYear();
        if (year >= 1990 && year <= 2100) {
          return parsedFromExcel;
        }
        return null;
      }

      if (numeric > 1000000000000 && numeric < 10000000000000) {
        const parsedFromTimestamp = new Date(numeric);
        const year = parsedFromTimestamp.getUTCFullYear();
        if (!Number.isNaN(parsedFromTimestamp.getTime()) && year >= 1990 && year <= 2100) {
          return parsedFromTimestamp;
        }
      }
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return parsed;
}

function normalizeBatteryHealth(value: string | undefined | null): { value: string | null; error: string | null } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { value: null, error: null };

  const numericRaw = Number(trimmed.replace(/%/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numericRaw) || numericRaw < 0) {
    return { value: null, error: "Battery health must be a valid number." };
  }

  let percentage = numericRaw;
  if (percentage < 1) {
    percentage *= 100;
  }

  if (percentage > 100) {
    return { value: null, error: "Battery health cannot be greater than 100%." };
  }

  const normalizedNumber = Number.isInteger(percentage)
    ? String(percentage)
    : String(Number(percentage.toFixed(2)));

  return { value: `${normalizedNumber}%`, error: null };
}

async function getDefaultSiteId(organizationId: string): Promise<string> {
  const site = await db.site.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: "Main",
      },
    },
    update: {
      status: "Active",
    },
    create: {
      organizationId,
      name: "Main",
      status: "Active",
    },
    select: {
      id: true,
    },
  });

  return site.id;
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const {
      inventoryItemId,
      imei,
      sku,
      model,
      site,
      siteId,
      capacity,
      color,
      carrier,
      condition,
      grade,
      status,
      cost,
      costCurrency,
      costUsd,
      usdToPesosRate,
      costPesos,
      price,
      price2,
      price3,
      supplier,
      dateOfPurchase,
      batteryHealth,
      cycleCount,
      iosVersion,
      serialNumber,
      comments,
      qrRaw,
      deviceTypeId,
      source,
    } = body;

    const normalizedImei = typeof imei === "string" && imei.trim() ? imei.trim() : null;
    const normalizedSerialNumber =
      typeof serialNumber === "string" && serialNumber.trim() ? serialNumber.trim() : null;
    const normalizedSku = typeof sku === "string" && sku.trim() ? sku.trim().toUpperCase() : null;

    const isImportUpdate = String(source ?? "") === "inventory-import";
    if (isImportUpdate && !access.permissions.canImportInventoryUpdates) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!model) {
      return NextResponse.json(
        { error: "Model is required" },
        { status: 400 }
      );
    }

    if (!normalizedImei && !normalizedSerialNumber && !normalizedSku) {
      return NextResponse.json(
        { error: "IMEI, Serial Number, or SKU is required" },
        { status: 400 }
      );
    }

    const resolvedCost = parseDecimalRequired(
      typeof cost === "string" ? cost : undefined,
      parseDecimalRequired(costPesos, 0)
    );
    const resolvedCostCurrency = parseCurrencyCode(costCurrency);
    const normalizedBatteryHealth = normalizeBatteryHealth(
      typeof batteryHealth === "string" ? batteryHealth : null
    );

    if (normalizedBatteryHealth.error) {
      return NextResponse.json({ error: normalizedBatteryHealth.error }, { status: 400 });
    }

    let resolvedSiteId = await getDefaultSiteId(access.organizationId);
    if (typeof siteId === "string" && siteId.trim()) {
      const requestedSite = await db.site.findFirst({
        where: {
          id: siteId,
          organizationId: access.organizationId,
        },
        select: { id: true },
      });

      if (!requestedSite) {
        return NextResponse.json({ error: "Invalid site location" }, { status: 400 });
      }

      resolvedSiteId = requestedSite.id;
    } else if (typeof site === "string" && site.trim()) {
      const siteByName = await db.site.upsert({
        where: {
          organizationId_name: {
            organizationId: access.organizationId,
            name: site.trim(),
          },
        },
        update: {
          status: "Active",
        },
        create: {
          organizationId: access.organizationId,
          name: site.trim(),
          status: "Active",
        },
        select: {
          id: true,
        },
      });

      resolvedSiteId = siteByName.id;
    }

    // Find or create supplier if provided
    let supplierId: string | null = null;
    if (supplier && supplier.trim()) {
      const supplierRecord = await db.supplier.upsert({
        where: {
          organizationId_name: {
            organizationId: access.organizationId,
            name: supplier.trim(),
          },
        },
        update: {},
        create: {
          organizationId: access.organizationId,
          name: supplier.trim(),
          status: "Active",
        },
      });
      supplierId = supplierRecord.id;
    }

    let existing = null;
    if (typeof inventoryItemId === "string" && inventoryItemId.trim()) {
      existing = await db.inventoryItem.findFirst({
        where: {
          id: inventoryItemId.trim(),
          organizationId: access.organizationId,
        },
      });
    } else if (normalizedImei) {
      existing = await db.inventoryItem.findUnique({
        where: {
          organizationId_imei: {
            organizationId: access.organizationId,
            imei: normalizedImei,
          },
        },
      });
    } else if (normalizedSerialNumber) {
      existing = await db.inventoryItem.findFirst({
        where: {
          organizationId: access.organizationId,
          serialNumber: normalizedSerialNumber,
        },
      });
    } else if (normalizedSku) {
      existing = await db.inventoryItem.findFirst({
        where: {
          organizationId: access.organizationId,
          sku: normalizedSku,
        },
      });
    }

    const conflictingImei = normalizedImei
      ? await db.inventoryItem.findUnique({
          where: {
            organizationId_imei: {
              organizationId: access.organizationId,
              imei: normalizedImei,
            },
          },
        })
      : null;

    if (conflictingImei && conflictingImei.id !== existing?.id) {
      return NextResponse.json({ error: "IMEI already exists in inventory" }, { status: 409 });
    }

    const conflictingSerial = !normalizedImei && normalizedSerialNumber
      ? await db.inventoryItem.findFirst({
          where: {
            organizationId: access.organizationId,
            serialNumber: normalizedSerialNumber,
          },
        })
      : null;

    if (conflictingSerial && conflictingSerial.id !== existing?.id) {
      return NextResponse.json(
        { error: "Serial Number already exists for a device without IMEI" },
        { status: 409 }
      );
    }

    const conflictingSku = normalizedSku
      ? await db.inventoryItem.findFirst({
          where: {
            organizationId: access.organizationId,
            sku: normalizedSku,
          },
        })
      : null;

    if (conflictingSku && conflictingSku.id !== existing?.id) {
      return NextResponse.json({ error: "SKU already exists in inventory" }, { status: 409 });
    }

    const nextPrice = parseDecimalRequired(price, 0);
    const nextPrice2 = parseDecimalRequired(price2, 0);
    const nextPrice3 = parseDecimalRequired(price3, 0);

    if (!access.permissions.canEditInventoryPrices) {
      if (existing) {
        const currentPrice = parseFloat(existing.price?.toString?.() ?? "0");
        const currentPrice2 = parseFloat(existing.price2?.toString?.() ?? "0");
        const currentPrice3 = parseFloat(existing.price3?.toString?.() ?? "0");
        const changed = currentPrice !== nextPrice || currentPrice2 !== nextPrice2 || currentPrice3 !== nextPrice3;
        if (changed) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        const attemptedPriceInput = [price, price2, price3].some((value) => String(value ?? "").trim().length > 0);
        if (attemptedPriceInput) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    let inventoryItem;
    if (existing) {
      // Update existing inventory item
      inventoryItem = await db.inventoryItem.update({
        where: {
          id: existing.id,
        },
        data: {
          siteId: resolvedSiteId,
          imei: normalizedImei,
          sku: normalizedSku,
          model,
          capacity,
          color,
          carrier,
          condition,
          grade: grade || null,
          status,
          costUsd: null,
          usdToPesosRate: null,
          costPesos: resolvedCost,
          costCurrency: resolvedCostCurrency,
          price: nextPrice,
          price2: nextPrice2,
          price3: nextPrice3,
          supplierId,
          dateOfPurchase: parseDateOptional(dateOfPurchase),
          batteryHealth: normalizedBatteryHealth.value,
          cycleCount: cycleCount ? parseInt(cycleCount) : null,
          iosVersion,
          serialNumber: normalizedSerialNumber,
          comments,
          qrRaw,
          deviceTypeId: deviceTypeId || null,
        },
      });
    } else {
      // Create new inventory item
      inventoryItem = await db.inventoryItem.create({
        data: {
          organizationId: access.organizationId,
          siteId: resolvedSiteId,
          imei: normalizedImei,
          sku: normalizedSku,
          model,
          capacity,
          color,
          carrier,
          condition,
          grade: grade || null,
          status,
          costUsd: null,
          usdToPesosRate: null,
          costPesos: resolvedCost,
          costCurrency: resolvedCostCurrency,
          price: nextPrice,
          price2: nextPrice2,
          price3: nextPrice3,
          supplierId,
          dateOfPurchase: parseDateOptional(dateOfPurchase),
          batteryHealth: normalizedBatteryHealth.value,
          cycleCount: cycleCount ? parseInt(cycleCount) : null,
          iosVersion,
          serialNumber: normalizedSerialNumber,
          comments,
          qrRaw,
          deviceTypeId: deviceTypeId || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      inventoryItem,
      isUpdate: !!existing,
    });
  } catch (error) {
    console.error("Error saving inventory:", error);
    return NextResponse.json(
      { error: "Failed to save inventory item" },
      { status: 500 }
    );
  }
}

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
    const status = searchParams.get("status");

    const where: any = {
      organizationId: access.organizationId,
    };

    if (status && status !== "All") {
      where.status = status;
    }

    const inventoryItems = await db.inventoryItem.findMany({
      where,
      include: {
        supplier: true,
        site: true,
        deviceType: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ inventoryItems });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!access.permissions.canDeleteInventory) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const imeiFromBody = typeof body?.imei === "string" ? body.imei.trim() : "";
    const inventoryItemId = typeof body?.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const imeiFromQuery = new URL(request.url).searchParams.get("imei")?.trim() ?? "";
    const imei = imeiFromBody || imeiFromQuery;

    if (!reason) {
      return NextResponse.json({ error: "Missing delete reason" }, { status: 400 });
    }

    let existing;
    if (inventoryItemId) {
      existing = await db.inventoryItem.findFirst({
        where: {
          id: inventoryItemId,
          organizationId: access.organizationId,
        },
        select: { id: true, comments: true },
      });
    } else {
      if (!imei) {
        return NextResponse.json({ error: "Missing imei" }, { status: 400 });
      }

      existing = await db.inventoryItem.findUnique({
        where: {
          organizationId_imei: {
            organizationId: access.organizationId,
            imei,
          },
        },
        select: { id: true, comments: true },
      });
    }

    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const deleteComment = `[DELETED: ${reason}]`;
    const nextComments = existing.comments?.trim()
      ? `${existing.comments} | ${deleteComment}`
      : deleteComment;

    await db.inventoryItem.update({
      where: { id: existing.id },
      data: {
        status: "Deleted",
        comments: nextComments,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return NextResponse.json(
      { error: "Failed to delete inventory item" },
      { status: 500 }
    );
  }
}
