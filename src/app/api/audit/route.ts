import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { logAudit } from "@/lib/audit-log";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toCents = (value: unknown) => Math.round(Number(value) * 100);

const normalizeCustomerType = (value: unknown): "retail" | "wholesale" =>
  String(value ?? "").toLowerCase() === "wholesale" ? "wholesale" : "retail";

const summarizeItems = (
  items: Array<{ model: string; capacity: string; color: string; status: string }>
) => {
  const activeItems = items.filter((item) => item.status !== "Cancelled");
  if (activeItems.length === 0) return "No active items";

  const labels = activeItems.map((item) =>
    [item.model, item.capacity, item.color].filter(Boolean).join(" ").trim()
  );

  if (labels.length === 1) return labels[0] || "1 item";
  if (labels.length === 2) return labels.join(" + ");
  return `${labels[0]} + ${labels.length - 1} more`;
};

/** Parse "Cash: 50000 | Transfer: 20000 | Credit: 30000" → { Cash: 50000, Transfer: 20000, Credit: 30000 } */
function parsePaymentBreakdown(paymentMethod: string, saleTotal: number): Record<string, number> {
  const result: Record<string, number> = {
    Cash: 0,
    Transfer: 0,
    Card: 0,
    "Trade-in": 0,
    Other: 0,
    Credit: 0,
  };
  const raw = (paymentMethod ?? "").trim();
  if (!raw) return result;

  if (raw.includes("|")) {
    for (const segment of raw.split("|").map((s) => s.trim()).filter(Boolean)) {
      const colonIdx = segment.indexOf(":");
      if (colonIdx === -1) continue;
      const label = segment.slice(0, colonIdx).trim();
      const amount = Number(segment.slice(colonIdx + 1).trim());
      if (!label || Number.isNaN(amount)) continue;
      const key = Object.keys(result).find((k) => k.toLowerCase() === label.toLowerCase());
      if (key) result[key] += amount;
    }
    return result;
  }

  // Simple single-method
  const key = Object.keys(result).find((k) => k.toLowerCase() === raw.toLowerCase());
  if (key) result[key] = saleTotal;
  return result;
}

// ---------------------------------------------------------------------------
// GET /api/audit  — return summary for the current open period
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);

    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Determine period start (last audit's periodEndAt, or org createdAt)
    const lastAudit = await db.registerAudit.findFirst({
      where: { organizationId },
      orderBy: { periodEndAt: "desc" },
    });

    let periodStart: Date;
    if (lastAudit) {
      periodStart = lastAudit.periodEndAt;
    } else {
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true },
      });
      periodStart = org?.createdAt ?? new Date(0);
    }

    const periodEnd = new Date();

    // -----------------------------------------------------------------------
    // Sales in period (non-fully-cancelled)
    // -----------------------------------------------------------------------
    const sales = await db.sale.findMany({
      where: {
        organizationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      include: {
        customer: {
          select: {
            name: true,
            customerType: true,
          },
        },
        items: {
          select: {
            status: true,
            salePrice: true,
            model: true,
            capacity: true,
            color: true,
          },
        },
      },
    });

    let cashFromSalesCents = 0;
    let transferFromSalesCents = 0;
    let creditGrantedCents = 0;
    const expectedCashDetails: Array<{
      id: string;
      channel: "cash" | "transfer";
      source: "sale" | "credit_payment_current" | "credit_payment_past";
      saleId: string;
      customer: string;
      customerType: "retail" | "wholesale";
      itemSummary: string;
      paymentMethod: string;
      totalCents: number;
      createdAt: string;
    }> = [];
    const expectedTransferDetails: Array<{
      id: string;
      channel: "cash" | "transfer";
      source: "sale" | "credit_payment_current" | "credit_payment_past";
      saleId: string;
      customer: string;
      customerType: "retail" | "wholesale";
      itemSummary: string;
      paymentMethod: string;
      totalCents: number;
      createdAt: string;
    }> = [];

    for (const sale of sales) {
      const allCancelled = sale.items.every((i) => i.status === "Cancelled");
      if (allCancelled) continue;

      const activeTotal = sale.items
        .filter((i) => i.status !== "Cancelled")
        .reduce((sum, i) => sum + toCents(i.salePrice), 0);

      const breakdown = parsePaymentBreakdown(sale.paymentMethod ?? "", activeTotal / 100);
      const cashAmountCents = toCents(breakdown.Cash);
      const transferAmountCents = toCents(breakdown.Transfer);
      const cardAmountCents = toCents(breakdown.Card);

      cashFromSalesCents += cashAmountCents;
      transferFromSalesCents += transferAmountCents + cardAmountCents;
      creditGrantedCents += toCents(breakdown.Credit);

      const itemSummary = summarizeItems(sale.items);
      const customer = sale.customer?.name?.trim() || "Walk-in";
      const customerType = normalizeCustomerType(sale.customer?.customerType);

      if (cashAmountCents > 0) {
        expectedCashDetails.push({
          id: `sale-${sale.id}-cash`,
          channel: "cash",
          source: "sale",
          saleId: sale.saleNumber,
          customer,
          customerType,
          itemSummary,
          paymentMethod: "Cash",
          totalCents: cashAmountCents,
          createdAt: sale.createdAt.toISOString(),
        });
      }

      if (transferAmountCents > 0) {
        expectedTransferDetails.push({
          id: `sale-${sale.id}-transfer`,
          channel: "transfer",
          source: "sale",
          saleId: sale.saleNumber,
          customer,
          customerType,
          itemSummary,
          paymentMethod: "Transfer",
          totalCents: transferAmountCents,
          createdAt: sale.createdAt.toISOString(),
        });
      }

      if (cardAmountCents > 0) {
        expectedTransferDetails.push({
          id: `sale-${sale.id}-card`,
          channel: "transfer",
          source: "sale",
          saleId: sale.saleNumber,
          customer,
          customerType,
          itemSummary,
          paymentMethod: "Card",
          totalCents: cardAmountCents,
          createdAt: sale.createdAt.toISOString(),
        });
      }
    }

    // -----------------------------------------------------------------------
    // Credit partial payments received in period
    // Split into "for past-credit sales" vs "for current-period credit sales"
    // -----------------------------------------------------------------------
    const creditPaymentsInPeriod = await db.creditLedger.findMany({
      where: {
        organizationId,
        type: "partial_payment",
        createdAt: { gte: periodStart, lte: periodEnd },
        NOT: { note: { startsWith: "[CANCELLATION]" } },
      },
      include: {
        customer: {
          select: {
            name: true,
            customerType: true,
          },
        },
        sale: {
          include: {
            customer: {
              select: {
                name: true,
                customerType: true,
              },
            },
            items: {
              select: {
                status: true,
                model: true,
                capacity: true,
                color: true,
              },
            },
            creditLedger: {
              where: { type: "sale_on_credit" },
              select: { createdAt: true },
            },
          },
        },
      },
    });

    let cashFromPastCreditPaymentsCents = 0;
    let transferFromPastCreditPaymentsCents = 0;
    let cashFromCurrentCreditPaymentsCents = 0;
    let transferFromCurrentCreditPaymentsCents = 0;

    for (const entry of creditPaymentsInPeriod) {
      const saleOnCreditDate = entry.sale?.creditLedger?.[0]?.createdAt ?? null;
      const isPastCredit = saleOnCreditDate !== null && saleOnCreditDate < periodStart;
      const amountCents = Math.abs(toCents(entry.amount)); // partial_payment amounts are negative

      const method = (entry.paymentMethod ?? "").trim().toLowerCase();
      const isCash = method === "cash";
      const isTransfer = method === "transfer" || method === "card";
      const customer =
        entry.customer?.name?.trim() || entry.sale?.customer?.name?.trim() || "Unknown";
      const customerType = normalizeCustomerType(
        entry.customer?.customerType ?? entry.sale?.customer?.customerType
      );
      const itemSummary = entry.sale?.items?.length
        ? summarizeItems(entry.sale.items)
        : "Credit payment";
      const paymentMethod = method === "card" ? "Card" : isCash ? "Cash" : "Transfer";
      const detail = {
        id: `credit-${entry.id}`,
        channel: isCash ? "cash" : "transfer",
        source: isPastCredit ? "credit_payment_past" : "credit_payment_current",
        saleId: entry.sale?.saleNumber ?? "",
        customer,
        customerType,
        itemSummary,
        paymentMethod,
        totalCents: amountCents,
        createdAt: entry.createdAt.toISOString(),
      } as const;

      if (isPastCredit) {
        if (isCash) {
          cashFromPastCreditPaymentsCents += amountCents;
          expectedCashDetails.push(detail);
        }
        if (isTransfer) {
          transferFromPastCreditPaymentsCents += amountCents;
          expectedTransferDetails.push(detail);
        }
      } else {
        if (isCash) {
          cashFromCurrentCreditPaymentsCents += amountCents;
          expectedCashDetails.push(detail);
        }
        if (isTransfer) {
          transferFromCurrentCreditPaymentsCents += amountCents;
          expectedTransferDetails.push(detail);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Total expected cash / transfer for period
    // -----------------------------------------------------------------------
    const expectedCashCents =
      cashFromSalesCents + cashFromPastCreditPaymentsCents + cashFromCurrentCreditPaymentsCents;
    const expectedTransferCents =
      transferFromSalesCents +
      transferFromPastCreditPaymentsCents +
      transferFromCurrentCreditPaymentsCents;

    // -----------------------------------------------------------------------
    // Credit aging buckets — all open credit balances by customer
    // -----------------------------------------------------------------------
    const allSaleOnCreditEntries = await db.creditLedger.findMany({
      where: {
        organizationId,
        type: "sale_on_credit",
      },
      include: {
        customer: { select: { id: true, name: true } },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            creditLedger: {
              select: { amount: true, type: true, note: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const agingByCustomer = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        buckets: Record<string, number>;
        totalBalance: number;
        entries: Array<{
          saleId: string;
          saleNumber: string;
          originalAmount: number;
          paidAmount: number;
          balance: number;
          ageDays: number;
          createdAt: string;
        }>;
      }
    >();

    const nowMs = periodEnd.getTime();

    for (const entry of allSaleOnCreditEntries) {
      const principal = toCents(entry.amount); // positive
      const payments = (entry.sale?.creditLedger ?? [])
        .filter((l) => l.type === "partial_payment")
        .reduce((sum, l) => sum + toCents(l.amount), 0); // payments are negative
      const balance = principal + payments; // outstanding
      if (balance <= 0) continue; // fully paid

      const customerId = entry.customerId ?? "unknown";
      const customerName = entry.customer?.name ?? "Unknown";
      const ageDays = Math.floor((nowMs - entry.createdAt.getTime()) / 86_400_000);

      const bucket =
        ageDays <= 30
          ? "0-30"
          : ageDays <= 60
          ? "31-60"
          : ageDays <= 90
          ? "61-90"
          : "90+";

      if (!agingByCustomer.has(customerId)) {
        agingByCustomer.set(customerId, {
          customerId,
          customerName,
          buckets: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
          totalBalance: 0,
          entries: [],
        });
      }
      const row = agingByCustomer.get(customerId)!;
      row.buckets[bucket] += balance;
      row.totalBalance += balance;
      row.entries.push({
        saleId: entry.sale?.id ?? "",
        saleNumber: entry.sale?.saleNumber ?? "",
        originalAmount: principal,
        paidAmount: Math.abs(payments),
        balance,
        ageDays,
        createdAt: entry.createdAt.toISOString(),
      });
    }

    const creditAgingBuckets = Array.from(agingByCustomer.values()).sort(
      (a, b) => b.totalBalance - a.totalBalance
    );

    // -----------------------------------------------------------------------
    // Audit history (last 20)
    // -----------------------------------------------------------------------
    const auditHistory = await db.registerAudit.findMany({
      where: { organizationId },
      orderBy: { periodEndAt: "desc" },
      take: 20,
      include: {
        auditedBy: { select: { fullName: true, email: true } },
      },
    });

    return NextResponse.json({
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      expectedCashCents,
      expectedTransferCents,
      cashFromSalesCents,
      transferFromSalesCents,
      creditGrantedCents,
      cashFromPastCreditPaymentsCents,
      transferFromPastCreditPaymentsCents,
      cashFromCurrentCreditPaymentsCents,
      transferFromCurrentCreditPaymentsCents,
      expectedCashDetails,
      expectedTransferDetails,
      creditAgingBuckets,
      auditHistory: auditHistory.map((a) => ({
        id: a.id,
        periodStartAt: a.periodStartAt.toISOString(),
        periodEndAt: a.periodEndAt.toISOString(),
        expectedCashAmount: Number(a.expectedCashAmount),
        countedCashAmount: Number(a.countedCashAmount),
        cashDifferenceAmount: Number(a.cashDifferenceAmount),
        expectedTransferAmount: Number(a.expectedTransferAmount),
        countedTransferAmount: Number(a.countedTransferAmount),
        transferDifferenceAmount: Number(a.transferDifferenceAmount),
        notes: a.notes ?? "",
        auditedBy: a.auditedBy?.fullName ?? a.auditedBy?.email ?? "Unknown",
        createdAt: a.createdAt.toISOString(),
      })),
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

// ---------------------------------------------------------------------------
// POST /api/audit  — close the register for this period
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { organizationId, permissions, session } = await getRequestOrgAccess(request);

    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      countedCashAmount: number;
      countedTransferAmount: number;
      expectedCashAmount: number;
      expectedTransferAmount: number;
      notes?: string;
    };

    const { countedCashAmount, countedTransferAmount, expectedCashAmount, expectedTransferAmount, notes } = body;

    if (typeof countedCashAmount !== "number" || typeof countedTransferAmount !== "number") {
      return NextResponse.json({ error: "countedCashAmount and countedTransferAmount are required." }, { status: 400 });
    }

    // Determine period start
    const lastAudit = await db.registerAudit.findFirst({
      where: { organizationId },
      orderBy: { periodEndAt: "desc" },
    });

    let periodStartAt: Date;
    if (lastAudit) {
      periodStartAt = lastAudit.periodEndAt;
    } else {
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true },
      });
      periodStartAt = org?.createdAt ?? new Date(0);
    }

    const periodEndAt = new Date();
    const cashDifference = countedCashAmount - expectedCashAmount;
    const transferDifference = countedTransferAmount - expectedTransferAmount;

    const audit = await db.registerAudit.create({
      data: {
        organizationId,
        auditedByUserId: session.userId,
        periodStartAt,
        periodEndAt,
        expectedCashAmount,
        countedCashAmount,
        cashDifferenceAmount: cashDifference,
        expectedTransferAmount,
        countedTransferAmount,
        transferDifferenceAmount: transferDifference,
        notes: notes?.trim() || null,
      },
    });

    await logAudit({
      actorUserId: session.userId,
      action: "register.audit.close",
      entity: "RegisterAudit",
      entityId: audit.id,
      meta: {
        organizationId,
        periodStartAt: periodStartAt.toISOString(),
        periodEndAt: periodEndAt.toISOString(),
        expectedCashAmount,
        countedCashAmount,
        cashDifference,
        expectedTransferAmount,
        countedTransferAmount,
        transferDifference,
      },
    });

    return NextResponse.json({ audit: { id: audit.id } });
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
