import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { logAudit } from "@/lib/audit-log";

type ReconcileBody = {
  saleNumber?: string;
};

const toCents = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100);
};

// POST /api/credit-ledger/reconcile-cancelled-sale
// Repairs missing cancellation credit entries for a cancelled sale.
// Body: { saleNumber: string }
export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions, session } = access;

    if (!permissions.canManageOrgSettings) {
      return NextResponse.json(
        { error: "Only admins can reconcile credit ledger entries." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as ReconcileBody;
    const saleNumber = body.saleNumber?.trim();

    if (!saleNumber) {
      return NextResponse.json({ error: "saleNumber is required." }, { status: 400 });
    }

    const sale = await db.sale.findFirst({
      where: {
        organizationId,
        saleNumber,
      },
      select: {
        id: true,
        customerId: true,
        items: {
          select: {
            id: true,
            status: true,
            salePrice: true,
          },
        },
        creditLedger: {
          select: {
            id: true,
            type: true,
            amount: true,
            note: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    }

    if (!sale.customerId) {
      return NextResponse.json(
        { error: "Sale has no customer associated with credit ledger." },
        { status: 400 }
      );
    }

    const hasCreditSaleEntry = sale.creditLedger.some((entry) => entry.type === "sale_on_credit");
    if (!hasCreditSaleEntry) {
      return NextResponse.json(
        { error: "Sale has no credit ledger debt entry to reconcile." },
        { status: 400 }
      );
    }

    const cancelledItems = sale.items.filter((item) => item.status === "Cancelled");
    const cancelledValueCents = cancelledItems.reduce(
      (sum, item) => sum + toCents(item.salePrice),
      0
    );
    const saleTotalCents = sale.items.reduce(
      (sum, item) => sum + toCents(item.salePrice),
      0
    );
    const creditPrincipalCents = sale.creditLedger
      .filter((entry) => entry.type === "sale_on_credit")
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);

    if (cancelledValueCents <= 0 || saleTotalCents <= 0 || creditPrincipalCents <= 0) {
      return NextResponse.json({
        success: true,
        changed: false,
        message: "Sale has no cancelled credit amount to reconcile.",
        summary: {
          saleNumber,
          cancelledValue: 0,
          creditPrincipal: creditPrincipalCents / 100,
          currentCancellationTotal: 0,
          missingAdjustment: 0,
        },
      });
    }

    const existingCancellationCents = sale.creditLedger
      .filter(
        (entry) =>
          entry.type === "partial_payment" &&
          String(entry.note ?? "").startsWith("[CANCELLATION]")
      )
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);

    const desiredCancellationCents = -Math.round(
      (creditPrincipalCents * cancelledValueCents) / saleTotalCents
    );
    const missingAdjustmentCents = desiredCancellationCents - existingCancellationCents;

    if (missingAdjustmentCents === 0) {
      return NextResponse.json({
        success: true,
        changed: false,
        message: "Credit cancellation entries are already in sync.",
        summary: {
          saleNumber,
          cancelledValue: cancelledValueCents / 100,
          creditPrincipal: creditPrincipalCents / 100,
          currentCancellationTotal: existingCancellationCents / 100,
          missingAdjustment: 0,
        },
      });
    }

    const entry = await db.creditLedger.create({
      data: {
        organizationId,
        customerId: sale.customerId,
        saleId: sale.id,
        type: "partial_payment",
        amount: missingAdjustmentCents / 100,
        note: `[CANCELLATION][RECONCILE] Sale ${saleNumber}: synchronize cancellation credit adjustment`,
        createdByUserId: session.userId,
      },
    });

    await logAudit({
      actorUserId: session.userId,
      action: "credit.cancellation.reconcile",
      entity: "CreditLedger",
      entityId: entry.id,
      meta: {
        organizationId,
        saleId: sale.id,
        saleNumber,
        cancelledValue: cancelledValueCents / 100,
        creditPrincipal: creditPrincipalCents / 100,
        existingCancellationTotal: existingCancellationCents / 100,
        insertedAmount: missingAdjustmentCents / 100,
      },
    });

    return NextResponse.json({
      success: true,
      changed: true,
      message: "Cancellation credit adjustment has been synchronized.",
      entry: {
        id: entry.id,
        amount: Number(entry.amount),
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
      },
      summary: {
        saleNumber,
        cancelledValue: cancelledValueCents / 100,
        creditPrincipal: creditPrincipalCents / 100,
        currentCancellationTotal: existingCancellationCents / 100,
        missingAdjustment: missingAdjustmentCents / 100,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
