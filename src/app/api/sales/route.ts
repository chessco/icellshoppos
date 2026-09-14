import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { sendInventoryRequestNotificationEmail, sendSaleReceiptEmail } from "@/lib/email";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { getAppBaseUrl } from "@/lib/org-invites";
import { isSubscriptionActive } from "@/lib/subscription";
import { buildSaleReceiptPdf } from "@/lib/sale-receipt-pdf";
import { normalizeReceiptConfig } from "@/lib/receipt-config";
import { buildWhatsappNumber, parseWhatsappNumber } from "@/lib/whatsapp";

type SaleItemInput = {
  inventoryItemId?: string;
  imei: string;
  salePrice: number;
};

type SaleCreatePayload = {
  saleId?: string;
  customerName?: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  sendReceiptEmail?: boolean;
  paymentMethod?: string;
  paymentBreakdown?: Record<string, number | string>;
  notes?: string;
  soldBy?: string;
  items: SaleItemInput[];
};

type InventoryRequestNotificationPayload = {
  targetOrganizationId: string;
  targetOrganizationName: string;
  sourceOrganizationName: string;
  customerEmail: string;
  saleId: string;
  items: Array<{
    imei: string;
    model: string;
    capacity: string;
    color: string;
    salePrice: string;
  }>;
};

const normalizeImei = (value: string | null | undefined) => (value ?? "").trim().replace(/\D/g, "");

const parseNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toNumber = (value: unknown) => {
  if (value && typeof value === "object" && "toString" in value) {
    return parseNumber((value as { toString: () => string }).toString());
  }
  return parseNumber(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const resolveOrganizationId = async (request: NextRequest) => {
  const access = await getRequestOrgAccess(request);
  return { session: access.session, organizationId: access.organizationId, permissions: access.permissions };
};

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveOrganizationId(request);
    const { organizationId } = resolved;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) {
        createdAtFilter.gte = parsed;
      }
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) {
        createdAtFilter.lte = parsed;
      }
    }

    const sales = await db.sale.findMany({
      where: {
        organizationId,
        ...(Object.keys(createdAtFilter).length > 0
          ? { createdAt: createdAtFilter }
          : {}),
      },
      include: {
        customer: true,
        items: {
          include: {
            inventoryItem: {
              select: {
                serialNumber: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response = sales.map((sale) => ({
      saleId: sale.saleNumber,
      soldAt: sale.createdAt.toISOString(),
      customer: sale.customer?.name ?? "",
      customerType: sale.customer?.customerType ?? "retail",
      customerEmail: sale.customer?.email ?? "",
      customerWhatsapp: sale.customer?.whatsapp ?? "",
      paymentMethod: sale.paymentMethod ?? "",
      notes: sale.notes ?? "",
      soldBy: sale.soldBy ?? "",
      lines: sale.items.map((item) => ({
        id: item.id,
        imei: item.imei,
        serialNumber: item.inventoryItem?.serialNumber ?? "",
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        costPesos: item.cost.toString(),
        salePrice: item.salePrice.toString(),
        marginPesos: toNumber(item.salePrice) - toNumber(item.cost),
        status: item.status,
      })),
    }));

    return NextResponse.json({ sales: response });
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
    const resolved = await resolveOrganizationId(request);
    const { session, organizationId, permissions } = resolved;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as SaleCreatePayload;

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: "No sale items provided" }, { status: 400 });
    }

    const customerName = body.customerName?.trim();
    const customerEmail = body.customerEmail?.trim().toLowerCase();
    const customerWhatsapp = body.customerWhatsapp?.trim();
    const paymentMethod = body.paymentMethod?.trim();
    const paymentBreakdown = body.paymentBreakdown ?? {};
    const creditAmount = parseNumber(paymentBreakdown["Credit"]);
    const normalizedWhatsapp = buildWhatsappNumber(
      parseWhatsappNumber(customerWhatsapp).countryCode,
      parseWhatsappNumber(customerWhatsapp).localNumber
    );

    if (!customerName) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }

    if (!normalizedWhatsapp) {
      return NextResponse.json(
        { error: "Customer WhatsApp is required with country code and 10-digit number." },
        { status: 400 }
      );
    }

    if (!paymentMethod) {
      return NextResponse.json({ error: "Payment method is required." }, { status: 400 });
    }

    // Validate credit payment: customer must have creditEnabled for any credit amount.
    if (creditAmount > 0 || paymentMethod === "Credit") {
      const creditCustomer = await db.customer.findFirst({
        where: { organizationId, name: customerName },
        select: { id: true, creditEnabled: true },
      });
      if (!creditCustomer?.creditEnabled) {
        return NextResponse.json(
          { error: "Credit payment is not enabled for this customer." },
          { status: 400 }
        );
      }
    }

    // Block checkout when subscription/trial has expired
    const sub = await db.subscription.findFirst({
      where: { organizationId },
      select: { status: true, trialEndsAt: true },
    });
    if (!isSubscriptionActive(sub)) {
      return NextResponse.json(
        { error: "Your subscription has expired. Please upgrade your plan to continue processing sales." },
        { status: 403 }
      );
    }

    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoData: true, logoMimeType: true, receiptConfigJson: true },
    });

    const imeis = body.items.map((item) => normalizeImei(item.imei)).filter(Boolean);
    const itemIds = body.items.map((item) => item.inventoryItemId).filter((id): id is string => Boolean(id));

    const inventoryItems: Array<{
      id: string;
      imei: string | null;
      model: string;
      capacity: string;
      color: string;
      costPesos: { toString?: () => string } | number | null;
    }> = await db.inventoryItem.findMany({
      where: {
        organizationId,
        OR: [
          ...(imeis.length > 0 ? [{ imei: { in: imeis } }] : []),
          ...(itemIds.length > 0 ? [{ id: { in: itemIds } }] : []),
        ],
      },
      select: {
        id: true,
        imei: true,
        model: true,
        capacity: true,
        color: true,
        costPesos: true,
      },
    });

    const inventoryByImei = new Map(
      inventoryItems
        .filter((item) => item.imei)
        .map((item) => [normalizeImei(item.imei), item] as const)
    );
    const inventoryById = new Map(
      inventoryItems.map((item) => [item.id, item] as const)
    );

    const saleNumber = body.saleId?.trim() || `S-${Date.now()}`;
    const subtotal = body.items.reduce((sum, item) => sum + parseNumber(item.salePrice), 0);
    let customerId: string | null = null;

    const currentUser = await db.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, email: true },
    });

    const soldByName = currentUser?.fullName?.trim() || currentUser?.email?.trim() || session.email || null;

    const existingCustomer = await db.customer.findFirst({
      where: {
        organizationId,
        name: customerName,
      },
    });

    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (
        (existingCustomer.whatsapp ?? "").trim() !== normalizedWhatsapp ||
        ((existingCustomer.email ?? "").trim().toLowerCase() !== (customerEmail ?? ""))
      ) {
        await db.customer.update({
          where: { id: existingCustomer.id },
          data: {
            whatsapp: normalizedWhatsapp,
            email: customerEmail || existingCustomer.email,
          },
        });
      }
    } else {
      const createdCustomer = await db.customer.create({
        data: {
          organizationId,
          name: customerName,
          email: customerEmail || null,
          whatsapp: normalizedWhatsapp,
        },
      });
      customerId = createdCustomer.id;
    }

    let inventoryRequestNotification: InventoryRequestNotificationPayload | null = null;

    const sale = await db.$transaction(async (transaction) => {
      const createdSale = await transaction.sale.create({
        data: {
          organizationId,
          customerId,
          saleNumber,
          subtotal,
          total: subtotal,
          paymentMethod,
          notes: body.notes?.trim() || null,
          soldBy: soldByName,
        },
      });

      const saleItemsData = body.items.map((item) => {
        const inventoryItem =
          (item.inventoryItemId ? inventoryById.get(item.inventoryItemId) : undefined) ??
          inventoryByImei.get(normalizeImei(item.imei));
        const costPesos = inventoryItem?.costPesos ?? 0;

        return {
          saleId: createdSale.id,
          inventoryItemId: inventoryItem?.id ?? null,
          imei: inventoryItem?.imei ?? item.imei,
          model: inventoryItem?.model ?? "",
          capacity: inventoryItem?.capacity ?? "",
          color: inventoryItem?.color ?? "",
          salePrice: parseNumber(item.salePrice),
          cost: Number(costPesos),
          status: "Finished",
        };
      });

      await transaction.saleItem.createMany({ data: saleItemsData });

      const createdSaleItems = await transaction.saleItem.findMany({
        where: {
          saleId: createdSale.id,
        },
        include: {
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
      });

      if (customerEmail) {
        const targetMembership = await transaction.membership.findFirst({
          where: {
            organizationId: {
              not: organizationId,
            },
            user: {
              email: customerEmail,
              status: "active",
            },
            organization: {
              status: "active",
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            organizationId: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        });

        if (targetMembership) {
          const transferRequest = await transaction.inventoryTransferRequest.upsert({
            where: {
              sourceOrganizationId_targetOrganizationId_saleId: {
                sourceOrganizationId: organizationId,
                targetOrganizationId: targetMembership.organizationId,
                saleId: createdSale.id,
              },
            },
            update: {
              customerEmail,
              status: "pending",
            },
            create: {
              sourceOrganizationId: organizationId,
              targetOrganizationId: targetMembership.organizationId,
              saleId: createdSale.id,
              customerEmail,
              status: "pending",
            },
            select: {
              id: true,
            },
          });

          await transaction.inventoryTransferItem.createMany({
            data: createdSaleItems.map((saleItem) => ({
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

          inventoryRequestNotification = {
            targetOrganizationId: targetMembership.organizationId,
            targetOrganizationName: targetMembership.organization.name,
            sourceOrganizationName: organization?.name ?? "Pro Buyer",
            customerEmail,
            saleId: createdSale.saleNumber,
            items: createdSaleItems.map((saleItem) => ({
              imei: saleItem.imei,
              model: saleItem.model,
              capacity: saleItem.capacity,
              color: saleItem.color,
              salePrice: saleItem.salePrice.toString(),
            })),
          };
        }
      }

      const allInventoryIds = inventoryItems.map((item) => item.id).filter(Boolean);
      if (allInventoryIds.length > 0) {
        await transaction.inventoryItem.updateMany({
          where: {
            organizationId,
            id: { in: allInventoryIds },
          },
          data: {
            status: "Sold",
          },
        });
      }

      if (createdSale.saleNumber.startsWith("PR-")) {
        const candidates = await transaction.purchaseRequest.findMany({
          where: {
            organizationId,
            status: "pending",
          },
          select: {
            id: true,
            payload: true,
          },
        });

        const matchedPurchaseRequest = candidates.find((record) => {
          const payload = isRecord(record.payload) ? record.payload : null;
          return String(payload?.saleId ?? "").trim() === createdSale.saleNumber;
        });

        if (matchedPurchaseRequest) {
          await transaction.purchaseRequest.update({
            where: { id: matchedPurchaseRequest.id },
            data: { status: "completed" },
          });
        }
      }

      return createdSale;
    }, { timeout: 15000 });

    // Log sale creation in AuditLog after transaction commit to keep the interactive transaction short.
    await logAudit({
      actorUserId: session.userId,
      action: "create",
      entity: "sale",
      entityId: sale.id,
      meta: {
        saleNumber: sale.saleNumber,
        subtotal: sale.subtotal,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        notes: sale.notes,
        soldBy: sale.soldBy,
        customerId: sale.customerId,
      },
    });

    const shouldSendReceiptEmail = body.sendReceiptEmail !== false;

    if (customerEmail && shouldSendReceiptEmail) {
      try {
        const receiptItems = body.items.map((item) => {
          const inventoryItem =
            (item.inventoryItemId ? inventoryById.get(item.inventoryItemId) : undefined) ??
            inventoryByImei.get(normalizeImei(item.imei));
          return {
            imei: inventoryItem?.imei ?? item.imei,
            model: inventoryItem?.model ?? "",
            capacity: inventoryItem?.capacity ?? "",
            color: inventoryItem?.color ?? "",
            salePrice: parseNumber(item.salePrice),
          };
        });

        const receiptPdf = await buildSaleReceiptPdf({
          companyName: organization?.name ?? "Pro Buyer",
          saleId: sale.saleNumber,
          soldAt: sale.createdAt,
          customerName: customerName,
          customerWhatsapp: normalizedWhatsapp,
          customerEmail,
          paymentMethod: paymentMethod,
          soldBy: soldByName ?? "",
          notes: body.notes?.trim() ?? "",
          logoDataUrl:
            organization?.logoData && organization.logoMimeType
              ? `data:${organization.logoMimeType};base64,${Buffer.from(organization.logoData).toString("base64")}`
              : null,
          receiptConfig: normalizeReceiptConfig(organization?.receiptConfigJson),
          items: receiptItems,
          total: subtotal,
        });

        const companyLogoDataUrl =
          organization?.logoData && organization.logoMimeType
            ? `data:${organization.logoMimeType};base64,${Buffer.from(organization.logoData).toString("base64")}`
            : null;

        await sendSaleReceiptEmail({
          to: customerEmail,
          customerName,
          companyName: organization?.name,
          companyLogoDataUrl,
          saleId: sale.saleNumber,
          receiptPdf,
        });
      } catch (mailError) {
        console.error("[sales] failed to send receipt email", {
          saleId: sale.saleNumber,
          customerEmail,
          message: mailError instanceof Error ? mailError.message : String(mailError),
        });
      }
    }

    if (inventoryRequestNotification) {
      const notification = inventoryRequestNotification as InventoryRequestNotificationPayload;

      try {
        const recipients = await db.membership.findMany({
          where: {
            organizationId: notification.targetOrganizationId,
            user: {
              status: "active",
            },
          },
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
        });

        const reviewUrl = `${getAppBaseUrl()}/inventory-requests`;
        const uniqueEmails = Array.from(
          new Set(
            recipients
              .map((recipient) => recipient.user.email.trim().toLowerCase())
              .filter(Boolean)
          )
        );

        await Promise.allSettled(
          uniqueEmails.map((email) =>
            sendInventoryRequestNotificationEmail({
              to: email,
              sourceOrganizationName: notification.sourceOrganizationName,
              targetOrganizationName: notification.targetOrganizationName,
              customerEmail: notification.customerEmail,
              saleId: notification.saleId,
              items: notification.items,
              reviewUrl,
            })
          )
        );
      } catch (mailError) {
        console.error("[sales] failed to send inventory request notification email", {
          saleId: notification.saleId,
          organizationId: notification.targetOrganizationId,
          message: mailError instanceof Error ? mailError.message : String(mailError),
        });
      }
    }

    // Create a CreditLedger entry for any credit amount used in the split payment.
    if (customerId && (creditAmount > 0 || paymentMethod === "Credit")) {
      const ledgerAmount = creditAmount > 0 ? creditAmount : subtotal;
      await db.creditLedger.create({
        data: {
          organizationId,
          customerId,
          saleId: sale.id,
          type: "sale_on_credit",
          amount: ledgerAmount, // positive = debt incurred
          note: `Sale ${sale.saleNumber}`,
          createdByUserId: session.userId,
        },
      });
    }

    return NextResponse.json({ success: true, saleId: sale.saleNumber });
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
