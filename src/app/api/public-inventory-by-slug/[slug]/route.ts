import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSubscriptionActive } from "@/lib/subscription";

const ALL_PUBLIC_COLUMN_KEYS = [
  "allowOffers",
  "imei",
  "sku",
  "model",
  "capacity",
  "color",
  "carrier",
  "condition",
  "grade",
  "supplier",
  "site",
  "dateOfPurchase",
  "cost",
  "costCurrency",
  "price",
  "price2",
  "price3",
  "status",
  "batteryHealth",
  "cycleCount",
  "iosVersion",
  "serialNumber",
  "comments",
  "createdAt",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    // Find organization by slug
    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        status: true,
        publicInventoryEnabled: true,
        publicInventoryColumns: true,
        subscriptions: {
          select: { status: true, trialEndsAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Check if org is active/suspended
    if (org.status === "archived") {
      return NextResponse.json(
        { error: "This organization is no longer active" },
        { status: 403 }
      );
    }

    // Block public inventory when subscription/trial has expired
    if (!isSubscriptionActive(org.subscriptions[0] ?? null)) {
      return NextResponse.json(
        { error: "Public inventory is not available" },
        { status: 403 }
      );
    }

    // Check if public inventory is enabled
    if (!org.publicInventoryEnabled) {
      return NextResponse.json(
        { error: "Public inventory is not enabled for this organization" },
        { status: 403 }
      );
    }

    // Parse columns
    let columns = ["model", "color", "capacity", "batteryHealth", "price"];
    if (org.publicInventoryColumns) {
      try {
        columns = JSON.parse(org.publicInventoryColumns);
      } catch {
        // use defaults
      }
    }

    const normalizedColumns = columns.filter((column) =>
      ALL_PUBLIC_COLUMN_KEYS.includes(column as (typeof ALL_PUBLIC_COLUMN_KEYS)[number])
    );
    const offersEnabled = normalizedColumns.includes("allowOffers");
    const visibleColumns = normalizedColumns.filter((column) => column !== "allowOffers");

    // Fetch inventory
    const items = await db.inventoryItem.findMany({
      where: {
        organizationId: org.id,
        status: "Available",
      },
      select: {
        id: true,
        imei: true,
        sku: true,
        model: true,
        capacity: true,
        color: true,
        carrier: true,
        condition: true,
        grade: true,
        dateOfPurchase: true,
        costPesos: true,
        costCurrency: true,
        batteryHealth: true,
        cycleCount: true,
        iosVersion: true,
        serialNumber: true,
        comments: true,
        price: true,
        price2: true,
        price3: true,
        status: true,
        createdAt: true,
        supplier: {
          select: {
            name: true,
          },
        },
        site: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map items to only include selected columns
    const mapped = items.map((item) => {
      const result: Record<string, string> = {
        id: item.id,
        imei: item.imei || "",
        sku: item.sku || "",
        price: item.price?.toString() || "",
      };

      if (visibleColumns.includes("imei")) result.imei = item.imei || "";
      if (visibleColumns.includes("sku")) result.sku = item.sku || "";
      if (visibleColumns.includes("model")) result.model = item.model || "";
      if (visibleColumns.includes("capacity")) result.capacity = item.capacity || "";
      if (visibleColumns.includes("color")) result.color = item.color || "";
      if (visibleColumns.includes("carrier")) result.carrier = item.carrier || "";
      if (visibleColumns.includes("condition")) result.condition = item.condition || "";
      if (visibleColumns.includes("grade")) result.grade = item.grade || "";
      if (visibleColumns.includes("supplier")) result.supplier = item.supplier?.name || "";
      if (visibleColumns.includes("site")) result.site = item.site?.name || "";
      if (visibleColumns.includes("dateOfPurchase")) result.dateOfPurchase = item.dateOfPurchase?.toISOString() || "";
      if (visibleColumns.includes("cost")) result.cost = item.costPesos?.toString() || "";
      if (visibleColumns.includes("costCurrency")) result.costCurrency = item.costCurrency || "MXN";
      if (visibleColumns.includes("price")) result.price = item.price?.toString() || "";
      if (visibleColumns.includes("price2")) result.price2 = item.price2?.toString() || "";
      if (visibleColumns.includes("price3")) result.price3 = item.price3?.toString() || "";
      if (visibleColumns.includes("status")) result.status = item.status || "";
      if (visibleColumns.includes("batteryHealth")) result.batteryHealth = item.batteryHealth || "";
      if (visibleColumns.includes("cycleCount")) result.cycleCount = item.cycleCount?.toString() || "";
      if (visibleColumns.includes("iosVersion")) result.iosVersion = item.iosVersion || "";
      if (visibleColumns.includes("serialNumber")) result.serialNumber = item.serialNumber || "";
      if (visibleColumns.includes("comments")) result.comments = item.comments || "";
      if (visibleColumns.includes("createdAt")) result.createdAt = item.createdAt.toISOString();

      return result;
    });

    return NextResponse.json({
      companyName: org.name,
      items: mapped,
      columns: visibleColumns,
      offersEnabled,
    });
  } catch (error) {
    console.error("GET /api/public-inventory-by-slug/[slug] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
