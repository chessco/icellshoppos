import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const imei = searchParams.get("imei");
    const id = searchParams.get("id");
    const serialNumber = searchParams.get("serialNumber");
    const sku = searchParams.get("sku");
    const excludeId = searchParams.get("excludeId");
    const normalizedSku = sku?.trim().toUpperCase() ?? "";

    if (!imei && !id && !serialNumber && !normalizedSku) {
      return NextResponse.json({ error: "IMEI, Serial Number, SKU, or ID is required" }, { status: 400 });
    }

    let existing;
    if (id) {
      existing = await db.inventoryItem.findFirst({
        where: {
          id,
          organizationId: session.activeOrganizationId,
        },
        include: {
          supplier: true,
          site: true,
          deviceType: true,
        },
      });
    } else if (serialNumber) {
      existing = await db.inventoryItem.findFirst({
        where: {
          organizationId: session.activeOrganizationId,
          serialNumber,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        include: {
          supplier: true,
          site: true,
          deviceType: true,
        },
      });
    } else if (normalizedSku) {
      existing = await db.inventoryItem.findFirst({
        where: {
          organizationId: session.activeOrganizationId,
          sku: normalizedSku,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        include: {
          supplier: true,
          site: true,
          deviceType: true,
        },
      });
    } else {
      const inventoryItem = await db.inventoryItem.findUnique({
        where: {
          organizationId_imei: {
            organizationId: session.activeOrganizationId,
            imei: imei!,
          },
        },
        include: {
          supplier: true,
          site: true,
          deviceType: true,
        },
      });

      existing = excludeId && inventoryItem?.id === excludeId ? null : inventoryItem;
    }

    return NextResponse.json({
      exists: !!existing,
      inventoryItem: existing || null,
      supplierName: existing?.supplier?.name || null,
    });
  } catch (error) {
    console.error("Error checking IMEI:", error);
    return NextResponse.json(
      { error: "Failed to check IMEI" },
      { status: 500 }
    );
  }
}
