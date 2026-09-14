import { RepairStage, RepairStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";

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

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
};

const repairStages = new Set<string>(Object.values(RepairStage));
const repairStatuses = new Set<string>(Object.values(RepairStatus));

const parseRepairStage = (value: string | null) =>
  value && repairStages.has(value) ? (value as RepairStage) : null;

const parseRepairStatus = (value: string | null) =>
  value && repairStatuses.has(value) ? (value as RepairStatus) : null;

const buildRepairPublicId = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `REP-${stamp}-${rand}`;
};

const mapTicket = (ticket: any) => ({
  id: ticket.id,
  repairId: ticket.repairId,
  repairNumber: ticket.repairNumber,
  brand: ticket.brand,
  model: ticket.model,
  color: ticket.color,
  imei: ticket.imei,
  customerName: ticket.customerName,
  customerWhatsapp: ticket.customerWhatsapp,
  customerEmail: ticket.customerEmail,
  stage: ticket.stage,
  status: ticket.status,
  diagnosisPending: ticket.diagnosisPending,
  quotedTotal: ticket.quotedTotal === null ? null : Number(ticket.quotedTotal),
  partsCost: ticket.partsCost === null ? null : Number(ticket.partsCost),
  createdAt: ticket.createdAt.toISOString(),
  updatedAt: ticket.updatedAt.toISOString(),
  readyForPickupAt: ticket.readyForPickupAt?.toISOString() ?? null,
  partsSupplier: ticket.partsSupplier,
  statusLogs: ticket.statusLogs?.map((log: any) => ({
    id: log.id,
    stage: log.stage,
    status: log.status,
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
    changedBy: log.changedBy?.fullName ?? log.changedBy?.email ?? "Unknown",
  })),
});

export async function GET(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const stage = parseRepairStage(normalizeString(searchParams.get("stage")));
    const status = parseRepairStatus(normalizeString(searchParams.get("status")));

    const tickets = await db.repairTicket.findMany({
      where: {
        organizationId,
        ...(stage ? { stage } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        partsSupplier: { select: { id: true, name: true } },
        statusLogs: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            changedBy: {
              select: { fullName: true, email: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      tickets: tickets.map((ticket) => mapTicket(ticket)),
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

export async function POST(request: NextRequest) {
  try {
    const { organizationId, permissions, session } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const brand = normalizeString(body.brand);
    const model = normalizeString(body.model);
    const color = normalizeString(body.color);
    const imei = normalizeString(body.imei);
    const notes = normalizeString(body.notes);
    const customerName = normalizeString(body.customerName);
    const customerEmail = normalizeString(body.customerEmail)?.toLowerCase() ?? null;
    const intakeDiagnosisText = normalizeString(body.intakeDiagnosisText);
    const possibleFixText = normalizeString(body.possibleFixText);
    const partsSupplierId = normalizeString(body.partsSupplierId);
    const extras = normalizeStringArray(body.extras);
    const intakeFailures = normalizeStringArray(body.intakeFailures);
    const diagnosisPending = Boolean(body.diagnosisPending);
    const quotedTotal = parseMoney(body.quotedTotal);
    const partsCost = parseMoney(body.partsCost);

    if (!brand || !model || !customerName) {
      return NextResponse.json(
        { error: "Brand, model, and customer name are required." },
        { status: 400 }
      );
    }

    const normalizedWhatsapp = normalizeWhatsappFromPayload({
      whatsapp: body.customerWhatsapp,
      whatsappCountryCode: body.whatsappCountryCode,
      whatsappNumber: body.whatsappNumber,
    });

    if (!normalizedWhatsapp) {
      return NextResponse.json({ error: "Valid customer WhatsApp is required." }, { status: 400 });
    }

    if (!diagnosisPending && quotedTotal === null) {
      return NextResponse.json(
        { error: "Total repair price is required unless diagnosis is pending." },
        { status: 400 }
      );
    }

    let validPartsSupplierId: string | null = null;
    if (partsSupplierId) {
      const supplier = await db.partsSupplier.findFirst({
        where: { id: partsSupplierId, organizationId },
        select: { id: true },
      });
      if (!supplier) {
        return NextResponse.json({ error: "Parts supplier not found." }, { status: 400 });
      }
      validPartsSupplierId = supplier.id;
    }

    const customerWhere = [
      { whatsapp: normalizedWhatsapp },
      ...(customerEmail ? [{ email: customerEmail }] : []),
      { name: customerName },
    ];

    const existingCustomer = await db.customer.findFirst({
      where: {
        organizationId,
        OR: customerWhere,
      },
      orderBy: { createdAt: "desc" },
    });

    const customer =
      existingCustomer ??
      (await db.customer.create({
        data: {
          organizationId,
          name: customerName,
          email: customerEmail,
          whatsapp: normalizedWhatsapp,
          defaultPriceTier: "Price",
          status: "Active",
          customerType: "retail",
        },
      }));

    const initialStatus: RepairStatus = diagnosisPending ? "pending_diagnosis" : "received";
    const repairId = buildRepairPublicId();
    const repairNumber = repairId;

    const ticket = await db.repairTicket.create({
      data: {
        organizationId,
        customerId: customer.id,
        partsSupplierId: validPartsSupplierId,
        repairId,
        repairNumber,
        brand,
        model,
        color,
        imei,
        extrasJson: extras,
        notes,
        intakeFailuresJson: intakeFailures,
        intakeDiagnosisText,
        possibleFixText,
        diagnosisPending,
        quotedTotal,
        partsCost,
        stage: "receive",
        status: initialStatus,
        customerName,
        customerWhatsapp: normalizedWhatsapp,
        customerEmail,
        statusLogs: {
          create: {
            changedByUserId: session.userId,
            stage: "receive",
            status: initialStatus,
            notes: "Repair ticket created.",
          },
        },
      },
      include: {
        partsSupplier: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      actorUserId: session.userId,
      action: "repair.create",
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

    return NextResponse.json({ ticket: mapTicket(ticket) }, { status: 201 });
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