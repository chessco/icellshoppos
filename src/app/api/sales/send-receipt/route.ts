import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { sendSaleReceiptEmail } from "@/lib/email";
import { buildSaleReceiptPdf } from "@/lib/sale-receipt-pdf";
import { normalizeReceiptConfig } from "@/lib/receipt-config";

const parseNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const saleId = String((body as { saleId?: string })?.saleId ?? "").trim();
    if (!saleId) {
      return NextResponse.json({ error: "Sale ID is required." }, { status: 400 });
    }

    const organizationId = membership.organizationId;
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoData: true, logoMimeType: true, receiptConfigJson: true },
    });

    const sale = await db.sale.findFirst({
      where: {
        organizationId,
        saleNumber: saleId,
      },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!sale) {
      return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    }

    const targetEmail = sale.customer?.email?.trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ error: "Customer email is missing for this sale." }, { status: 400 });
    }

    const receiptPdf = await buildSaleReceiptPdf({
      companyName: organization?.name ?? "Pro Buyer",
      saleId: sale.saleNumber,
      soldAt: sale.createdAt,
      customerName: sale.customer?.name ?? "",
      customerWhatsapp: sale.customer?.whatsapp ?? "",
      customerEmail: sale.customer?.email ?? "",
      paymentMethod: sale.paymentMethod ?? "",
      soldBy: sale.soldBy ?? "",
      notes: sale.notes ?? "",
      logoDataUrl:
        organization?.logoData && organization.logoMimeType
          ? `data:${organization.logoMimeType};base64,${Buffer.from(organization.logoData).toString("base64")}`
          : null,
      receiptConfig: normalizeReceiptConfig(organization?.receiptConfigJson),
      items: sale.items.map((item) => ({
        imei: item.imei,
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        salePrice: parseNumber(item.salePrice),
      })),
      total: parseNumber(sale.total),
    });

    const companyLogoDataUrl =
      organization?.logoData && organization.logoMimeType
        ? `data:${organization.logoMimeType};base64,${Buffer.from(organization.logoData).toString("base64")}`
        : null;

    await sendSaleReceiptEmail({
      to: targetEmail,
      customerName: sale.customer?.name,
      companyName: organization?.name,
      companyLogoDataUrl,
      saleId: sale.saleNumber,
      receiptPdf,
    });

    return NextResponse.json({ success: true });
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