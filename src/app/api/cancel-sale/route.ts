import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { buildSaleReceiptPdf } from "@/lib/sale-receipt-pdf";
import { sendSaleReceiptEmail } from "@/lib/email";
import { normalizeReceiptConfig } from "@/lib/receipt-config";

type CancelItem = {
  imei?: string;
  saleItemId?: string;
};

const toCents = (value: unknown) => Math.round(Number(value) * 100);

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canCancelSales) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { saleId, items, reason, fullSale } = body as {
      saleId: string;
      items?: CancelItem[];
      reason: string;
      fullSale?: boolean;
    };

    if (!saleId) {
      return NextResponse.json(
        { error: "Invalid request: saleId is required" },
        { status: 400 }
      );
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "Cancellation reason is required" },
        { status: 400 }
      );
    }

    const requestedImeis = (Array.isArray(items) ? items : [])
      .map((item) => String(item.imei ?? "").trim())
      .filter(Boolean);
    const requestedSaleItemIds = (Array.isArray(items) ? items : [])
      .map((item) => String(item.saleItemId ?? "").trim())
      .filter(Boolean);

    const creditAdjustment = await db.$transaction(async (transaction) => {
      const sale = await transaction.sale.findFirst({
        where: {
          organizationId: access.organizationId,
          saleNumber: saleId,
        },
        include: {
          creditLedger: {
            select: {
              id: true,
              type: true,
              amount: true,
              note: true,
            },
          },
          items: {
            select: {
              id: true,
              inventoryItemId: true,
              imei: true,
              status: true,
              salePrice: true,
            },
          },
        },
      });

      if (!sale) {
        throw new Error("Sale not found");
      }

      const saleItemsToCancel = fullSale
        ? sale.items.filter((item) => item.status !== "Cancelled")
        : sale.items.filter(
            (item) =>
              item.status !== "Cancelled" &&
              (requestedSaleItemIds.includes(item.id) || requestedImeis.includes(item.imei))
          );

      if (saleItemsToCancel.length === 0) {
        throw new Error("No sale items available to cancel");
      }

      const reasonNote = `${new Date().toISOString()} - Cancelled from sale ${saleId}: ${reason.trim()}`;

      for (const item of saleItemsToCancel) {
        await transaction.saleItem.update({
          where: { id: item.id },
          data: { status: "Cancelled" },
        });

        if (item.inventoryItemId) {
          await transaction.inventoryItem.updateMany({
            where: {
              organizationId: access.organizationId,
              id: item.inventoryItemId,
            },
            data: {
              status: "Available",
              comments: reasonNote,
            },
          });
        } else {
          await transaction.inventoryItem.updateMany({
            where: {
              organizationId: access.organizationId,
              imei: item.imei,
            },
            data: {
              status: "Available",
              comments: reasonNote,
            },
          });
        }
      }

      const updatedNotes = sale.notes
        ? `${sale.notes}\n[CANCELLED ${new Date().toISOString()}]: ${reason}`
        : `[CANCELLED ${new Date().toISOString()}]: ${reason}`;

      await transaction.sale.update({
        where: { id: sale.id },
        data: { notes: updatedNotes },
      });

      // Capture credit adjustment details to apply after transaction commit
      const hasCreditBalance =
        sale.paymentMethod === "Credit" ||
        sale.creditLedger.some((entry) => entry.type === "sale_on_credit");

      if (hasCreditBalance && sale.customerId && saleItemsToCancel.length > 0) {
        const saleTotalCents = sale.items.reduce(
          (sum, item) => sum + toCents(item.salePrice),
          0
        );
        const currentCancelledValueCents = saleItemsToCancel.reduce(
          (sum, item) => sum + toCents(item.salePrice),
          0
        );
        const previouslyCancelledValueCents = sale.items
          .filter((item) => item.status === "Cancelled")
          .reduce((sum, item) => sum + toCents(item.salePrice), 0);
        const cumulativeCancelledValueCents =
          previouslyCancelledValueCents + currentCancelledValueCents;
        const creditPrincipalCents = sale.creditLedger
          .filter((entry) => entry.type === "sale_on_credit")
          .reduce((sum, entry) => sum + toCents(entry.amount), 0);
        const existingCancellationCents = sale.creditLedger
          .filter(
            (entry) =>
              entry.type === "partial_payment" &&
              String(entry.note ?? "").startsWith("[CANCELLATION]")
          )
          .reduce((sum, entry) => sum + toCents(entry.amount), 0);

        const desiredCancellationCents =
          saleTotalCents > 0
            ? -Math.round((creditPrincipalCents * cumulativeCancelledValueCents) / saleTotalCents)
            : 0;
        const adjustmentCents = desiredCancellationCents - existingCancellationCents;

        if (adjustmentCents === 0) {
          return null;
        }

        return {
          organizationId: access.organizationId,
          customerId: sale.customerId,
          saleId: sale.id,
          amount: adjustmentCents / 100,
          note: `[CANCELLATION] Sale ${saleId}: ${reason.trim()}`,
          createdByUserId: access.session.userId,
        };
      }

      return null;
    });

    if (creditAdjustment) {
      await (db as any).creditLedger.create({
        data: {
          organizationId: creditAdjustment.organizationId,
          customerId: creditAdjustment.customerId,
          saleId: creditAdjustment.saleId,
          type: "partial_payment",
          amount: creditAdjustment.amount,
          note: creditAdjustment.note,
          createdByUserId: creditAdjustment.createdByUserId,
        },
      });
    }

    // After cancellation, fetch updated sale and organization for corrected invoice
    try {
      const updatedSale = await db.sale.findFirst({
        where: {
          organizationId: access.organizationId,
          saleNumber: saleId,
        },
        include: {
          customer: true,
          items: true,
          organization: {
            select: { name: true, logoData: true, logoMimeType: true, receiptConfigJson: true },
          },
        },
      });

      if (updatedSale && updatedSale.customer?.email) {
        // Prepare cancelled IMEIs
        const cancelledImeis = updatedSale.items.filter(i => i.status === "Cancelled").map(i => i.imei);
        // Calculate new total (cancelled items as negative)
        const total = updatedSale.items.reduce((sum, item) => {
          if (item.status === "Cancelled") return sum - Math.abs(Number(item.salePrice) || 0);
          return sum + (Number(item.salePrice) || 0);
        }, 0);
        // Build PDF
        const receiptPdf = await buildSaleReceiptPdf({
          companyName: updatedSale.organization?.name ?? "Pro Buyer",
          saleId: updatedSale.saleNumber,
          soldAt: updatedSale.createdAt,
          customerName: updatedSale.customer?.name ?? "",
          customerWhatsapp: updatedSale.customer?.whatsapp ?? "",
          customerEmail: updatedSale.customer?.email ?? "",
          paymentMethod: updatedSale.paymentMethod ?? "",
          soldBy: updatedSale.soldBy ?? "",
          notes: updatedSale.notes ?? "",
          logoDataUrl:
            updatedSale.organization?.logoData && updatedSale.organization.logoMimeType
              ? `data:${updatedSale.organization.logoMimeType};base64,${Buffer.from(updatedSale.organization.logoData).toString("base64")}`
              : null,
          receiptConfig: normalizeReceiptConfig(updatedSale.organization?.receiptConfigJson),
          items: updatedSale.items.map((item) => ({
            imei: item.imei,
            model: item.model,
            capacity: item.capacity,
            color: item.color,
            salePrice: Number(item.salePrice) || 0,
            status: item.status,
          })),
          total,
          correctionMode: true,
          cancelledImeis,
        });
        // Send corrected invoice email
        await sendSaleReceiptEmail({
          to: updatedSale.customer.email,
          customerName: updatedSale.customer.name,
          companyName: updatedSale.organization?.name,
          companyLogoDataUrl:
            updatedSale.organization?.logoData && updatedSale.organization.logoMimeType
              ? `data:${updatedSale.organization.logoMimeType};base64,${Buffer.from(updatedSale.organization.logoData).toString("base64")}`
              : null,
          saleId: updatedSale.saleNumber + "-CORRECTED",
          receiptPdf,
          // Custom subject/body for correction (optional: handled in sendSaleReceiptEmail if needed)
        });
      }
    } catch (err) {
      // Log but do not block cancellation if email fails
      console.error("Failed to send corrected invoice email", err);
    }

    const processedCount = fullSale ? "all" : String(requestedImeis.length);
    return NextResponse.json({
      success: true,
      message: `Cancelled ${processedCount} item(s) from sale ${saleId} successfully`,
      fullSale: Boolean(fullSale),
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
        error: error instanceof Error ? error.message : "Failed to cancel sale",
      },
      { status: 500 }
    );
  }
}
