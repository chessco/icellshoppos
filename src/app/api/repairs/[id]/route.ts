import { RepairStage, RepairStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { getRequestOrgAccess } from "@/lib/org-permissions";

const parseMoney = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeString = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const mapTicket = (ticket: any) => ({
  id: ticket.id,
  repairId: ticket.repairId,
  repairNumber: ticket.repairNumber,
  brand: ticket.brand,
  model: ticket.model,
  color: ticket.color,
  imei: ticket.imei,
  repairCustomerId: ticket.repairCustomerId,
  repairCustomer: ticket.repairCustomer
    ? {
        id: ticket.repairCustomer.id,
        name: ticket.repairCustomer.name,
        whatsapp: ticket.repairCustomer.whatsapp,
        email: ticket.repairCustomer.email,
      }
    : null,
  extras: Array.isArray(ticket.extrasJson) ? ticket.extrasJson : [],
  notes: ticket.notes,
  intakeFailures: Array.isArray(ticket.intakeFailuresJson) ? ticket.intakeFailuresJson : [],
  intakeDiagnosisText: ticket.intakeDiagnosisText,
  possibleFixText: ticket.possibleFixText,
  diagnosisText: ticket.diagnosisText,
  diagnosisPending: ticket.diagnosisPending,
  quotedTotal: ticket.quotedTotal === null ? null : Number(ticket.quotedTotal),
  partsCost: ticket.partsCost === null ? null : Number(ticket.partsCost),
  stage: ticket.stage,
  status: ticket.status,
  customerName: ticket.customerName,
  customerWhatsapp: ticket.customerWhatsapp,
  customerEmail: ticket.customerEmail,
  partsSupplierId: ticket.partsSupplierId,
  partsSupplier: ticket.partsSupplier,
  completedSaleId: ticket.completedSaleId,
  completedSaleNumber: ticket.completedSale?.saleNumber ?? null,
  createdAt: ticket.createdAt.toISOString(),
  updatedAt: ticket.updatedAt.toISOString(),
  readyForPickupAt: ticket.readyForPickupAt?.toISOString() ?? null,
  completedAt: ticket.completedAt?.toISOString() ?? null,
  parts: ticket.parts.map((part: any) => ({
    id: part.id,
    name: part.name,
    quantity: part.quantity,
    unitCost: part.unitCost === null ? null : Number(part.unitCost),
  })),
  statusLogs: ticket.statusLogs.map((log: any) => ({
    id: log.id,
    stage: log.stage,
    status: log.status,
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
    changedBy: log.changedBy?.fullName ?? log.changedBy?.email ?? "Unknown",
  })),
});

const updatableRepairStatuses = new Set<RepairStatus>([
  "approved",
  "disassembled",
  "parts_received",
  "working",
  "testing",
]);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;

    const [ticket, suppliers] = await Promise.all([
      db.repairTicket.findFirst({
        where: { id, organizationId },
        include: {
          completedSale: { select: { saleNumber: true } },
          repairCustomer: { select: { id: true, name: true, whatsapp: true, email: true } },
          partsSupplier: { select: { id: true, name: true } },
          parts: { orderBy: { createdAt: "asc" } },
          statusLogs: {
            orderBy: { createdAt: "desc" },
            include: {
              changedBy: {
                select: { fullName: true, email: true },
              },
            },
          },
        },
      }),
      db.partsSupplier.findMany({
        where: { organizationId, status: "Active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    const [repairCustomers, catalogOrg] = await Promise.all([
      db.repairCustomer.findMany({
        where: { organizationId, status: "Active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, whatsapp: true, email: true },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { repairCatalogJson: true },
      }),
    ]);

    if (!ticket) {
      return NextResponse.json({ error: "Repair ticket not found." }, { status: 404 });
    }

    return NextResponse.json({
      ticket: mapTicket(ticket),
      suppliers,
      repairCustomers,
      catalog: catalogOrg?.repairCatalogJson ?? { brands: [], colors: [] },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId, permissions, session } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = normalizeString(body.action);

    if (!action) {
      return NextResponse.json({ error: "Action is required." }, { status: 400 });
    }

    const existingTicket = await db.repairTicket.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        repairId: true,
        repairNumber: true,
        diagnosisPending: true,
        quotedTotal: true,
        partsCost: true,
        partsSupplierId: true,
        repairCustomerId: true,
        stage: true,
        status: true,
      },
    });

    if (!existingTicket) {
      return NextResponse.json({ error: "Repair ticket not found." }, { status: 404 });
    }

    let nextStage: RepairStage = existingTicket.stage;
    let nextStatus: RepairStatus = existingTicket.status;
    let notes = normalizeString(body.notes);
    const updateData: Record<string, unknown> = {};

    if (action === "saveDiagnosis") {
      const diagnosisText = normalizeString(body.diagnosisText);
      const quotedTotal = parseMoney(body.quotedTotal);
      if (existingTicket.diagnosisPending && quotedTotal === null) {
        return NextResponse.json(
          { error: "Total repair price is required to finish diagnosis." },
          { status: 400 }
        );
      }

      nextStage = "diagnosis";
      nextStatus = "awaiting_approval";
      updateData.diagnosisText = diagnosisText;
      updateData.diagnosisPending = false;
      if (existingTicket.diagnosisPending) {
        updateData.quotedTotal = quotedTotal;
      }
    } else if (action === "updateReceiveDetails") {
      const brand = normalizeString(body.brand);
      const model = normalizeString(body.model);
      const color = normalizeString(body.color);
      const imei = normalizeString(body.imei);
      const customerName = normalizeString(body.customerName);
      const customerWhatsapp = normalizeString(body.customerWhatsapp);
      const customerEmail = normalizeString(body.customerEmail);
      const repairCustomerId = normalizeString(body.repairCustomerId);

      if (!brand || !model || !customerName || !customerWhatsapp) {
        return NextResponse.json({ error: "Brand, model, customer name, and WhatsApp are required." }, { status: 400 });
      }

      if (repairCustomerId) {
        const customer = await db.repairCustomer.findFirst({
          where: { id: repairCustomerId, organizationId },
          select: { id: true },
        });
        if (!customer) {
          return NextResponse.json({ error: "Repair customer not found." }, { status: 400 });
        }
        updateData.repairCustomerId = customer.id;
      } else {
        updateData.repairCustomerId = null;
      }

      updateData.brand = brand;
      updateData.model = model;
      updateData.color = color || null;
      updateData.imei = imei || null;
      updateData.customerName = customerName;
      updateData.customerWhatsapp = customerWhatsapp;
      updateData.customerEmail = customerEmail || null;
    } else if (action === "approveDiagnosis") {
      if (existingTicket.quotedTotal === null) {
        return NextResponse.json({ error: "Diagnosis must include a quote before approval." }, { status: 400 });
      }
      nextStage = "repairing";
      nextStatus = "approved";
      notes = notes ?? "Customer approved repair quote.";
    } else if (action === "updateRepairProgress") {
      const repairStatus = normalizeString(body.status);
      const partsSupplierId = normalizeString(body.partsSupplierId);
      const partsCost = parseMoney(body.partsCost);

      if (!repairStatus || !updatableRepairStatuses.has(repairStatus as RepairStatus)) {
        return NextResponse.json({ error: "Invalid repair status." }, { status: 400 });
      }

      const nextRepairStatus = repairStatus as RepairStatus;
      const effectivePartsCost = partsCost ?? (existingTicket.partsCost === null ? null : Number(existingTicket.partsCost));
      if (nextRepairStatus !== "approved" && effectivePartsCost === null) {
        return NextResponse.json(
          { error: "Parts cost is required before starting active repair work." },
          { status: 400 }
        );
      }

      if (partsSupplierId) {
        const supplier = await db.partsSupplier.findFirst({
          where: { id: partsSupplierId, organizationId },
          select: { id: true },
        });
        if (!supplier) {
          return NextResponse.json({ error: "Parts supplier not found." }, { status: 400 });
        }
        updateData.partsSupplierId = supplier.id;
      } else {
        updateData.partsSupplierId = null;
      }

      updateData.partsCost = effectivePartsCost;
      nextStage = "repairing";
      nextStatus = nextRepairStatus;
    } else if (action === "markReadyForPickup") {
      if (existingTicket.quotedTotal === null) {
        return NextResponse.json({ error: "Cannot mark ready without a repair quote." }, { status: 400 });
      }
      nextStage = "ready_for_pickup";
      nextStatus = "ready_for_pickup";
      updateData.readyForPickupAt = new Date();
      notes = notes ?? "Repair marked ready for pickup.";
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    updateData.stage = nextStage;
    updateData.status = nextStatus;

    const ticket = await db.repairTicket.update({
      where: { id },
      data: {
        ...updateData,
        statusLogs: {
          create: {
            changedByUserId: session.userId,
            stage: nextStage,
            status: nextStatus,
            notes,
          },
        },
      },
      include: {
        completedSale: { select: { saleNumber: true } },
        repairCustomer: { select: { id: true, name: true, whatsapp: true, email: true } },
        partsSupplier: { select: { id: true, name: true } },
        parts: { orderBy: { createdAt: "asc" } },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: { fullName: true, email: true },
            },
          },
        },
      },
    });

    await logAudit({
      actorUserId: session.userId,
      action: `repair.${action}`,
      entity: "RepairTicket",
      entityId: ticket.id,
      meta: {
        organizationId,
        repairId: ticket.repairId,
        repairNumber: ticket.repairNumber,
        stage: ticket.stage,
        status: ticket.status,
      },
    });

    return NextResponse.json({ ticket: mapTicket(ticket) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}