import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { getRequestOrgAccess } from "@/lib/org-permissions";

type CheckoutPayload = {
  paymentMethod: "Cash" | "Transfer" | "Credit";
  paymentAmount?: number;
  notes?: string;
};

const parseNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: repairTicketId } = await context.params;

    const access = await getRequestOrgAccess(request);
    const { organizationId, session, permissions } = access;

    // Check authorization
    if (!permissions.canManageRepairs) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as CheckoutPayload;

    if (!body.paymentMethod) {
      return NextResponse.json({ error: "Payment method is required." }, { status: 400 });
    }

    // Fetch the repair ticket
    const repairTicket = await db.repairTicket.findUnique({
      where: { id: repairTicketId },
      include: {
        customer: true,
        parts: true,
        statusLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!repairTicket) {
      return NextResponse.json({ error: "Repair ticket not found." }, { status: 404 });
    }

    if (repairTicket.organizationId !== organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate repair is ready for pickup
    if (repairTicket.stage !== "ready_for_pickup") {
      return NextResponse.json(
        { error: `Repair must be in ready_for_pickup stage. Current stage: ${repairTicket.stage}` },
        { status: 400 }
      );
    }

    // Validate repair has a quoted total
    if (!repairTicket.quotedTotal) {
      return NextResponse.json(
        { error: "Repair must have a quoted total before checkout." },
        { status: 400 }
      );
    }

    // Check for idempotency: if already has a completed sale, return existing one
    if (repairTicket.completedSaleId) {
      const existingSale = await db.sale.findUnique({
        where: { id: repairTicket.completedSaleId },
        select: { id: true, saleNumber: true },
      });

      if (existingSale) {
        return NextResponse.json({
          success: true,
          saleId: existingSale.id,
          saleNumber: existingSale.saleNumber,
          ticketId: repairTicketId,
          isIdempotent: true,
        });
      }
    }

    // Get current user for soldBy
    const currentUser = await db.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, email: true },
    });

    const soldByName = currentUser?.fullName?.trim() || currentUser?.email?.trim() || session.email || null;

    const quotedTotal = Number(repairTicket.quotedTotal);
    const saleNumber = `REP-${Date.now()}`;
    const paymentMethod = body.paymentMethod;
    const paymentAmount = parseNumber(body.paymentAmount);
    const chargedTotal = paymentAmount > 0 ? paymentAmount : quotedTotal;

    // Ensure we have a customer ID (use existing or from ticket data)
    let customerId = repairTicket.customerId;

    if (!customerId) {
      // If no customer link, create/reuse customer by name and whatsapp
      const existingCustomer = await db.customer.findFirst({
        where: {
          organizationId,
          name: repairTicket.customerName,
        },
      });

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // Update customer contact info if needed
        if (
          (existingCustomer.whatsapp ?? "").trim() !== repairTicket.customerWhatsapp.trim() ||
          ((existingCustomer.email ?? "").trim() !== (repairTicket.customerEmail ?? "").trim())
        ) {
          await db.customer.update({
            where: { id: existingCustomer.id },
            data: {
              whatsapp: repairTicket.customerWhatsapp,
              email: repairTicket.customerEmail || existingCustomer.email,
            },
          });
        }
      } else {
        const createdCustomer = await db.customer.create({
          data: {
            organizationId,
            name: repairTicket.customerName,
            whatsapp: repairTicket.customerWhatsapp,
            email: repairTicket.customerEmail || null,
          },
        });
        customerId = createdCustomer.id;
      }
    }

    // Create sale and update repair in a transaction
    const result = await db.$transaction(async (transaction) => {
      // Create the sale
      const createdSale = await transaction.sale.create({
        data: {
          organizationId,
          customerId,
          saleNumber,
          subtotal: chargedTotal,
          total: chargedTotal,
          paymentMethod,
          notes:
            body.notes?.trim() ||
            `Repair pickup: ${repairTicket.repairId} (${repairTicket.repairNumber}) (Charged: ${chargedTotal})`,
          soldBy: soldByName,
        },
      });

      // Update repair ticket with picked_up status and link to sale
      await transaction.repairTicket.update({
        where: { id: repairTicketId },
        data: {
          stage: "completed",
          status: "picked_up",
          completedSaleId: createdSale.id,
          completedAt: new Date(),
        },
      });

      // Create status log for picked_up transition
      await transaction.repairTicketStatusLog.create({
        data: {
          repairTicketId,
          stage: "completed",
          status: "picked_up",
          changedByUserId: session.userId,
          notes: `Picked up via checkout for ${repairTicket.repairId}. Sale: ${createdSale.saleNumber}. Payment: ${paymentMethod} (Amount: ${chargedTotal})`,
        },
      });

      // Log audit entry
      await logAudit({
        actorUserId: session.userId,
        action: "repair.pickup.completed",
        entity: "repair",
        entityId: repairTicketId,
        meta: {
          repairId: repairTicket.repairId,
          repairNumber: repairTicket.repairNumber,
          saleId: createdSale.id,
          saleNumber: createdSale.saleNumber,
          quotedTotal,
          chargedTotal,
          paymentMethod,
          paymentAmount,
          customerId,
          organizationId,
        },
      });

      // Create CreditLedger entry if payment method is Credit
      if (paymentMethod === "Credit") {
        await transaction.creditLedger.create({
          data: {
            organizationId,
            customerId,
            saleId: createdSale.id,
            type: "sale_on_credit",
            amount: chargedTotal,
            note: `Repair pickup ${repairTicket.repairId}`,
            createdByUserId: session.userId,
          },
        });
      }

      return createdSale;
    });

    return NextResponse.json({
      success: true,
      saleId: result.id,
      saleNumber: result.saleNumber,
      ticketId: repairTicketId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[repairs/checkout] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
