// PATCH /api/credit-ledger
// Edits a partial payment entry. Admin-only.
// Body: { id: string, amount?: number, note?: string, paymentMethod?: string, paymentDate?: string }
export async function PATCH(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions, session } = access;
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Only admins can edit credit payments." }, { status: 403 });
    }
    const body = await request.json();
    const { id, amount, note, paymentMethod, paymentDate } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }
    const entry = await db.creditLedger.findFirst({ where: { id, organizationId } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    if (entry.type !== "partial_payment") {
      return NextResponse.json({ error: "Only payment entries can be edited." }, { status: 400 });
    }
    const updateData: any = {};
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      updateData.amount = -amount; // negative = reduces debt
    }
    if (typeof note === "string") {
      updateData.note = note.trim();
    }
    if (typeof paymentMethod === "string" && paymentMethod.trim()) {
      updateData.paymentMethod = paymentMethod.trim();
    }
    if (typeof paymentDate === "string" && paymentDate.trim()) {
      const parsedPaymentDate = parsePaymentDate(paymentDate);
      if (!parsedPaymentDate) {
        return NextResponse.json({ error: "paymentDate must be a valid YYYY-MM-DD date." }, { status: 400 });
      }
      updateData.createdAt = parsedPaymentDate;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }
    const updated = await db.creditLedger.update({ where: { id }, data: updateData });
    await logAudit({
      actorUserId: session.userId,
      action: "credit.payment.edit",
      entity: "CreditLedger",
      entityId: id,
      meta: { ...updateData },
    });
    return NextResponse.json({ entry: updated });
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

// DELETE /api/credit-ledger
// Deletes a partial payment entry. Admin-only.
// Body: { id: string }
export async function DELETE(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions, session } = access;
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Only admins can delete credit payments." }, { status: 403 });
    }
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }
    const entry = await db.creditLedger.findFirst({ where: { id, organizationId } });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    if (entry.type !== "partial_payment") {
      return NextResponse.json({ error: "Only payment entries can be deleted." }, { status: 400 });
    }
    await db.creditLedger.delete({ where: { id } });
    await logAudit({
      actorUserId: session.userId,
      action: "credit.payment.delete",
      entity: "CreditLedger",
      entityId: id,
      meta: {},
    });
    return NextResponse.json({ success: true });
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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { logAudit } from "@/lib/audit-log";
import { sendPartialPaymentNotificationEmail } from "@/lib/email";

function parsePaymentDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearText, monthText, dayText] = trimmed.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  // Store at local noon to avoid timezone date shifts when rendering the date back.
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

// GET /api/credit-ledger
// Returns all customers with credit enabled + their full ledger for the active org.
// Optional query param: ?customerId=<id> to scope to a single customer.
export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;
    const { searchParams } = new URL(request.url);
    const filterCustomerId = searchParams.get("customerId");

    const customers = await db.customer.findMany({
      where: {
        organizationId,
        creditEnabled: true,
        ...(filterCustomerId ? { id: filterCustomerId } : {}),
      },
      orderBy: { name: "asc" },
    });

    if (customers.length === 0) {
      return NextResponse.json({ customers: [], grandTotal: 0 });
    }

    const customerIds = customers.map((c) => c.id);

    const entries = await db.creditLedger.findMany({
      where: { organizationId, customerId: { in: customerIds } },
      include: {
        sale: { select: { saleNumber: true, createdAt: true } },
        createdBy: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = customers.map((customer) => {
      const customerEntries = entries.filter((e) => e.customerId === customer.id);

      // Group by sale
      const salesMap = new Map<
        string,
        { saleId: string; saleNumber: string; saleDate: string; entries: typeof customerEntries }
      >();
      const unallocated: typeof customerEntries = [];

      for (const entry of customerEntries) {
        if (entry.saleId && entry.sale) {
          if (!salesMap.has(entry.saleId)) {
            salesMap.set(entry.saleId, {
              saleId: entry.saleId,
              saleNumber: entry.sale.saleNumber,
              saleDate: entry.sale.createdAt.toISOString(),
              entries: [],
            });
          }
          salesMap.get(entry.saleId)!.entries.push(entry);
        } else {
          unallocated.push(entry);
        }
      }

      const salesSummary = Array.from(salesMap.values()).map((group) => {
        const originalCredit = group.entries
          .filter((e) => e.type === "sale_on_credit")
          .reduce((sum, e) => sum + Number(e.amount), 0);
        const cancellations = group.entries
          .filter(
            (e) =>
              e.type === "cancellation" ||
              (e.type === "partial_payment" && String(e.note ?? "").startsWith("[CANCELLATION]"))
          )
          .reduce((sum, e) => sum + Number(e.amount), 0); // negative
        return {
          saleId: group.saleId,
          saleNumber: group.saleNumber,
          saleDate: group.saleDate,
          originalCredit,
          cancellations,
          netOwed: originalCredit + cancellations,
        };
      });

      const totalPayments = customerEntries
        .filter(
          (e) =>
            e.type === "partial_payment" &&
            !String(e.note ?? "").startsWith("[CANCELLATION]")
        )
        .reduce((sum, e) => sum + Number(e.amount), 0); // negative

      const totalOnCredit = salesSummary.reduce((sum, s) => sum + s.originalCredit, 0);
      const totalCancellations = salesSummary.reduce((sum, s) => sum + s.cancellations, 0);
      const balance = totalOnCredit + totalCancellations + totalPayments;

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        whatsapp: customer.whatsapp,
        balance,
        totalOnCredit,
        totalCancellations,
        totalPayments,
        salesSummary,
        entries: customerEntries.map((e) => ({
          id: e.id,
          saleId: e.saleId,
          saleNumber: e.sale?.saleNumber ?? null,
          saleDate: e.sale?.createdAt.toISOString() ?? null,
          type: e.type,
          amount: Number(e.amount),
          note: e.note,
          createdAt: e.createdAt.toISOString(),
          createdBy: e.createdBy?.fullName ?? e.createdBy?.email ?? null,
        })),
      };
    });

    const grandTotal = result.reduce((sum, c) => sum + c.balance, 0);

    return NextResponse.json({ customers: result, grandTotal });
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

// POST /api/credit-ledger
// Records a partial payment from a customer. Admin-only.
// Body: { customerId: string, amount: number (positive = amount paid), note?: string, saleId?: string }
export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions, session } = access;

    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Only admins can record credit payments." }, { status: 403 });
    }

    const body = (await request.json()) as {
      customerId: string;
      amount: number;
      note?: string;
      saleId?: string;
      paymentMethod?: string;
      paymentDate?: string;
    };
    if (!body.customerId?.trim()) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 });
    }
    let paymentMethod: string | null = null;
    if (body.paymentMethod && typeof body.paymentMethod === "string" && body.paymentMethod.trim()) {
      paymentMethod = body.paymentMethod.trim();
    }

    let createdAt = new Date();
    if (typeof body.paymentDate === "string" && body.paymentDate.trim()) {
      const parsedPaymentDate = parsePaymentDate(body.paymentDate);
      if (!parsedPaymentDate) {
        return NextResponse.json({ error: "paymentDate must be a valid YYYY-MM-DD date." }, { status: 400 });
      }
      createdAt = parsedPaymentDate;
    }

    const customer = await db.customer.findFirst({
      where: { id: body.customerId, organizationId, creditEnabled: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found or credit not enabled." }, { status: 404 });
    }

    let saleId: string | null = null;
    if (body.saleId?.trim()) {
      const sale = await db.sale.findFirst({
        where: { id: body.saleId.trim(), organizationId, customerId: customer.id },
        select: { id: true },
      });
      if (!sale) {
        return NextResponse.json({ error: "Sale not found for this customer." }, { status: 404 });
      }
      saleId = sale.id;
    }

    // Get previous balance before payment
    const previousEntries = await db.creditLedger.findMany({
      where: { organizationId, customerId: customer.id },
      select: { amount: true },
    });
    const previousBalance = previousEntries.reduce((sum, e) => sum + Number(e.amount), 0);

    const entry = await db.creditLedger.create({
      data: {
        organizationId,
        customerId: customer.id,
        saleId,
        type: "partial_payment",
        amount: -amount, // negative = reduces debt
        note: body.note?.trim() || null,
        paymentMethod,
        createdByUserId: session.userId,
        createdAt,
      },
    });

    // New balance after payment
    const newBalance = previousBalance - amount;

    await logAudit({
      actorUserId: session.userId,
      action: "credit.payment",
      entity: "CreditLedger",
      entityId: entry.id,
      meta: { customerId: customer.id, customerName: customer.name, amount, paymentDate: createdAt.toISOString() },
    });

    // Send email notification if customer has an email
    if (customer.email && customer.email.includes("@")) {
      await sendPartialPaymentNotificationEmail({
        to: customer.email,
        customerName: customer.name,
        amountPaid: amount,
        previousBalance,
        newBalance,
      });
    }

    return NextResponse.json({ entry });
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
