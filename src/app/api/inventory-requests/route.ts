import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

async function backfillHistoricalInventoryRequestsForOrg(
  targetOrganizationId: string,
  rawEmail: string
) {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;

  const candidateSales = await db.sale.findMany({
    where: {
      organizationId: {
        not: targetOrganizationId,
      },
      customer: {
        email,
      },
    },
    select: {
      id: true,
      organizationId: true,
      items: {
        select: {
          id: true,
          imei: true,
          model: true,
          capacity: true,
          color: true,
          cost: true,
          salePrice: true,
          inventoryItem: {
            select: {
              carrier: true,
              condition: true,
              batteryHealth: true,
              cycleCount: true,
              iosVersion: true,
              serialNumber: true,
              comments: true,
              qrRaw: true,
            },
          },
        },
      },
    },
  });

  if (candidateSales.length === 0) return;

  const candidateSaleIds = candidateSales.map((sale) => sale.id);

  const existingRequests = await db.inventoryTransferRequest.findMany({
    where: {
      targetOrganizationId,
      saleId: { in: candidateSaleIds },
    },
    select: {
      saleId: true,
    },
  });

  const existingSaleIds = new Set(existingRequests.map((requestRecord) => requestRecord.saleId));
  const missingSales = candidateSales.filter((sale) => !existingSaleIds.has(sale.id));

  if (missingSales.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const sale of missingSales) {
      const transferRequest = await tx.inventoryTransferRequest.create({
        data: {
          sourceOrganizationId: sale.organizationId,
          targetOrganizationId,
          saleId: sale.id,
          customerEmail: email,
          status: "pending",
        },
        select: {
          id: true,
        },
      });

      if (sale.items.length === 0) continue;

      await tx.inventoryTransferItem.createMany({
        data: sale.items.map((saleItem) => ({
          requestId: transferRequest.id,
          saleItemId: saleItem.id,
          imei: saleItem.imei,
          model: saleItem.model,
          capacity: saleItem.capacity,
          color: saleItem.color,
          carrier: saleItem.inventoryItem?.carrier ?? null,
          condition: saleItem.inventoryItem?.condition ?? null,
          batteryHealth: saleItem.inventoryItem?.batteryHealth ?? null,
          cycleCount: saleItem.inventoryItem?.cycleCount ?? null,
          iosVersion: saleItem.inventoryItem?.iosVersion ?? null,
          serialNumber: saleItem.inventoryItem?.serialNumber ?? null,
          comments: saleItem.inventoryItem?.comments ?? null,
          qrRaw: saleItem.inventoryItem?.qrRaw ?? null,
          sourceCostPesos: saleItem.cost,
          sourceSalePrice: saleItem.salePrice,
        })),
        skipDuplicates: true,
      });
    }
  });
}

async function ensureMainSiteId(organizationId: string) {
  const site = await db.site.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: "Main",
      },
    },
    update: { status: "Active" },
    create: {
      organizationId,
      name: "Main",
      status: "Active",
    },
    select: { id: true },
  });

  return site.id;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ensure accounts created after a sale can still receive historical inventory requests
    // by linking past sales (matched by customer email) to the active organization on first view.
    await backfillHistoricalInventoryRequestsForOrg(membership.organizationId, session.email);

    const requests = await db.inventoryTransferRequest.findMany({
      where: {
        targetOrganizationId: membership.organizationId,
      },
      include: {
        sourceOrganization: {
          select: { id: true, name: true },
        },
        sale: {
          select: { id: true, saleNumber: true, createdAt: true },
        },
        items: {
          select: {
            id: true,
            imei: true,
            model: true,
            capacity: true,
            color: true,
            sourceSalePrice: true,
            importedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = requests.map((requestRecord) => ({
      id: requestRecord.id,
      status: requestRecord.status,
      customerEmail: requestRecord.customerEmail,
      sourceOrganizationId: requestRecord.sourceOrganizationId,
      sourceOrganization: requestRecord.sourceOrganization,
      sale: requestRecord.sale,
      createdAt: requestRecord.createdAt,
      isTradeIn: requestRecord.sourceOrganizationId === membership.organizationId,
      items: requestRecord.items.map((item) => ({
        id: item.id,
        imei: item.imei,
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        sourceSalePrice: item.sourceSalePrice.toString(),
        importedAt: item.importedAt,
      })),
      importedCount: requestRecord.items.filter((item) => Boolean(item.importedAt)).length,
      pendingCount: requestRecord.items.filter((item) => !item.importedAt).length,
    }));

    return NextResponse.json({ requests: formatted });
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const itemIds = Array.isArray(body?.itemIds)
      ? body.itemIds.filter((value: unknown): value is string => typeof value === "string")
      : null;

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const transferRequest = await db.inventoryTransferRequest.findFirst({
      where: {
        id: requestId,
        targetOrganizationId: membership.organizationId,
      },
      include: {
        sourceOrganization: { select: { name: true } },
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!transferRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isSameOrgTransfer = transferRequest.sourceOrganizationId === membership.organizationId;

    const mainSiteId = await ensureMainSiteId(membership.organizationId);
    const sourceSupplierName = transferRequest.sourceOrganization.name;

    const supplier = await db.supplier.upsert({
      where: {
        organizationId_name: {
          organizationId: membership.organizationId,
          name: sourceSupplierName,
        },
      },
      update: { status: "Active" },
      create: {
        organizationId: membership.organizationId,
        name: sourceSupplierName,
        status: "Active",
      },
      select: { id: true },
    });

    const targetItems = transferRequest.items.filter((item) => {
      if (item.importedAt) return false;
      if (!itemIds || itemIds.length === 0) return true;
      return itemIds.includes(item.id);
    });

    if (targetItems.length === 0) {
      return NextResponse.json({ error: "No pending items to import" }, { status: 400 });
    }

    const normalizedImeis = targetItems.map((item) => item.imei.trim());
    const existingInventory = await db.inventoryItem.findMany({
      where: {
        organizationId: membership.organizationId,
        imei: { in: normalizedImeis },
      },
      select: { id: true, imei: true, status: true },
    });
    const existingMap = new Map(existingInventory.map((item) => [item.imei, item]));

    const now = new Date();
    let imported = 0;
    let skipped = 0;

    await db.$transaction(async (tx) => {
      for (const item of targetItems) {
        const existingItem = existingMap.get(item.imei);

        // For same-org trade-ins: if IMEI exists with Sold status, re-activate it
        if (existingItem && isSameOrgTransfer && existingItem.status === "Sold") {
          await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: {
              status: "Available",
              costPesos: item.sourceSalePrice,
              price: item.sourceSalePrice,
              price2: item.sourceSalePrice,
              price3: item.sourceSalePrice,
              supplierId: supplier.id,
              batteryHealth: item.batteryHealth,
              cycleCount: item.cycleCount,
              iosVersion: item.iosVersion,
              serialNumber: item.serialNumber,
              comments: item.comments,
              qrRaw: item.qrRaw,
            },
          });

          await tx.inventoryTransferItem.update({
            where: { id: item.id },
            data: {
              importedAt: now,
              importedInventoryItemId: existingItem.id,
            },
          });

          imported += 1;
          continue;
        }

        // Skip if IMEI exists and it's not a same-org Sold item re-activation
        if (existingItem) {
          skipped += 1;
          continue;
        }

        const created = await tx.inventoryItem.create({
          data: {
            organizationId: membership.organizationId,
            siteId: mainSiteId,
            imei: item.imei,
            model: item.model,
            capacity: item.capacity,
            color: item.color,
            carrier: item.carrier,
            condition: item.condition,
            grade: item.condition,
            status: "Available",
            costPesos: item.sourceSalePrice,
            price: item.sourceSalePrice,
            price2: item.sourceSalePrice,
            price3: item.sourceSalePrice,
            supplierId: supplier.id,
            batteryHealth: item.batteryHealth,
            cycleCount: item.cycleCount,
            iosVersion: item.iosVersion,
            serialNumber: item.serialNumber,
            comments: item.comments,
            qrRaw: item.qrRaw,
          },
          select: { id: true },
        });

        await tx.inventoryTransferItem.update({
          where: { id: item.id },
          data: {
            importedAt: now,
            importedInventoryItemId: created.id,
          },
        });

        imported += 1;
      }

      const pendingAfter = await tx.inventoryTransferItem.count({
        where: {
          requestId: transferRequest.id,
          importedAt: null,
        },
      });

      if (pendingAfter === 0) {
        await tx.inventoryTransferRequest.update({
          where: { id: transferRequest.id },
          data: { status: "completed" },
        });
      }
    });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      message: `Imported ${imported} item(s). Skipped ${skipped} duplicate IMEI item(s).`,
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const transferRequest = await db.inventoryTransferRequest.findFirst({
      where: {
        id: requestId,
        targetOrganizationId: membership.organizationId,
      },
      include: {
        items: {
          select: {
            importedAt: true,
          },
        },
      },
    });

    if (!transferRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const hasImportedItems = transferRequest.items.some((item) => Boolean(item.importedAt));
    if (hasImportedItems) {
      return NextResponse.json(
        { error: "Only fully pending requests can be deleted." },
        { status: 400 }
      );
    }

    await db.inventoryTransferRequest.delete({
      where: { id: transferRequest.id },
    });

    return NextResponse.json({ success: true, message: "Inventory request deleted." });
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
