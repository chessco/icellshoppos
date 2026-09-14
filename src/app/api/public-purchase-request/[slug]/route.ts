import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPurchaseRequestNotificationEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/org-invites";
import { isSubscriptionActive } from "@/lib/subscription";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";

type PurchaseItem = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  batteryHealth?: string;
  price?: string;
  offerAmount?: string;
  offerCurrency?: "MXN" | "USD";
};

type PriceTier = "Price" | "Price 2" | "Price 3";

const parseAmount = (value: unknown) => {
  const numeric = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const normalizeTier = (value: unknown): PriceTier => {
  if (value === "Price 2") return "Price 2";
  if (value === "Price 3") return "Price 3";
  return "Price";
};

const resolveTierPrice = (
  tier: PriceTier,
  values: { price: number; price2: number; price3: number }
) => {
  if (tier === "Price 2") return values.price2 || values.price;
  if (tier === "Price 3") return values.price3 || values.price;
  return values.price;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { items, customerName, customerEmail, customerWhatsapp, offersEnabled } = body as {
      items: PurchaseItem[];
      customerName: string;
      customerEmail: string;
      customerWhatsapp: string;
      offersEnabled?: boolean;
    };

    // Validation
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items selected" }, { status: 400 });
    }

    if (!customerName?.trim() || !customerEmail?.trim()) {
      return NextResponse.json(
        { error: "Customer name, email, and WhatsApp are required" },
        { status: 400 }
      );
    }

    const normalizedWhatsapp = normalizeWhatsappFromPayload({
      whatsapp: customerWhatsapp,
      whatsappCountryCode: (body as { customerWhatsappCountryCode?: string }).customerWhatsappCountryCode,
      whatsappNumber: (body as { customerWhatsappNumber?: string }).customerWhatsappNumber,
    });

    if (!normalizedWhatsapp) {
      return NextResponse.json(
        { error: "WhatsApp must include a valid country code (+52 or +1) and a 10-digit number" },
        { status: 400 }
      );
    }

    // Find organization by slug
    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        status: true,
        publicInventoryEnabled: true,
        publicInventoryColumns: true,
        subscriptions: {
          select: { status: true, trialEndsAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let visibleColumns: string[] = [];
    if (org.publicInventoryColumns) {
      try {
        const parsedColumns = JSON.parse(org.publicInventoryColumns);
        if (Array.isArray(parsedColumns)) {
          visibleColumns = parsedColumns.filter((entry) => typeof entry === "string");
        }
      } catch {
        visibleColumns = [];
      }
    }

    const orgOffersEnabled = visibleColumns.includes("allowOffers");
    const useOffers = orgOffersEnabled && Boolean(offersEnabled);

    // Check if org is active and has public inventory enabled
    if (org.status === "archived" || !org.publicInventoryEnabled) {
      return NextResponse.json(
        { error: "Public inventory is not available" },
        { status: 403 }
      );
    }

    const subscription = org.subscriptions[0];
    if (!isSubscriptionActive(subscription ?? null)) {
      return NextResponse.json(
        { error: "Public inventory is not available" },
        { status: 403 }
      );
    }

    const normalizedEmail = customerEmail.trim().toLowerCase();

    // Check if customer exists, if not create one
    let customer = await db.customer.findFirst({
      where: {
        organizationId: org.id,
        email: normalizedEmail,
      },
    });

    if (!customer) {
      customer = await db.customer.create({
        data: {
          organizationId: org.id,
          name: customerName.trim(),
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          status: "Active",
        },
      });
    }

    const customerTier = normalizeTier(customer.defaultPriceTier);

    let usdToMxnRate = 0;
    if (useOffers) {
      for (const item of items) {
        const amountRaw = String(item.offerAmount ?? "").trim();
        if (!amountRaw) continue;
        if (parseAmount(amountRaw) <= 0) {
          return NextResponse.json(
            { error: `Offer amount for IMEI ${item.imei} must be greater than 0.` },
            { status: 400 }
          );
        }
      }

      const needsUsdConversion = items.some(
        (item) => String(item.offerAmount ?? "").trim().length > 0 && item.offerCurrency === "USD"
      );

      if (needsUsdConversion) {
        const latestRate = await db.exchangeRate.findFirst({
          where: { organizationId: org.id },
          orderBy: { createdAt: "desc" },
          select: { usdToMxn: true },
        });

        if (!latestRate) {
          return NextResponse.json(
            { error: "USD offers are unavailable right now because exchange rate is not configured." },
            { status: 400 }
          );
        }

        usdToMxnRate = parseAmount(latestRate.usdToMxn);
      }
    }

    // Fetch inventory details for selected items
    const imeis = items.map((item) => item.imei).filter(Boolean);
    const inventoryRows = await db.inventoryItem.findMany({
      where: {
        organizationId: org.id,
        imei: { in: imeis },
        status: "Available",
      },
      select: {
        imei: true,
        model: true,
        capacity: true,
        color: true,
        batteryHealth: true,
        costPesos: true,
        price: true,
        price2: true,
        price3: true,
      },
    });

    const inventoryByImei = new Map(
      inventoryRows.map((row) => [row.imei, row])
    );

    const enrichedItems = items
      .map((item) => {
        const inventoryRow = inventoryByImei.get(item.imei);
        if (!inventoryRow) return null;

        const basePrice = parseAmount(inventoryRow.price);
        const tierPrice = resolveTierPrice(customerTier, {
          price: basePrice,
          price2: parseAmount(inventoryRow.price2),
          price3: parseAmount(inventoryRow.price3),
        });

        const offerAmountRaw = String(item.offerAmount ?? "").trim();
        const offerCurrency = item.offerCurrency === "USD" ? "USD" : "MXN";
        const offerParsed = offerAmountRaw ? parseAmount(offerAmountRaw) : 0;

        const offerAmountMxn = !offerAmountRaw
          ? null
          : offerCurrency === "USD"
          ? roundMoney(offerParsed * usdToMxnRate)
          : roundMoney(offerParsed);

        const effectiveOfferMxn = useOffers
          ? roundMoney(offerAmountMxn ?? tierPrice)
          : basePrice;

        return {
          imei: inventoryRow.imei,
          model: inventoryRow.model || "",
          capacity: inventoryRow.capacity || "",
          color: inventoryRow.color || "",
          batteryHealth: inventoryRow.batteryHealth || "",
          costPesos: inventoryRow.costPesos?.toString() || "0",
          price: basePrice.toString(),
          tierName: customerTier,
          tierPriceMxn: roundMoney(tierPrice),
          offerAmountRaw: offerAmountRaw || null,
          offerCurrency,
          offerAmountMxn,
          effectiveOfferMxn,
          differenceMxn: roundMoney(effectiveOfferMxn - tierPrice),
          offerAccepted: useOffers ? false : true,
          exchangeRateUsed: offerCurrency === "USD" && offerAmountRaw ? usdToMxnRate : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (enrichedItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items found" },
        { status: 400 }
      );
    }

    const saleId = `PR-${Date.now()}`;
    const payload = {
      saleId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerWhatsapp: customer.whatsapp,
      offersEnabled: useOffers,
      items: enrichedItems,
    };

    await db.purchaseRequest.create({
      data: {
        organizationId: org.id,
        requesterName: customer.name,
        requesterEmail: customer.email || normalizedEmail,
        requesterWhatsapp: customer.whatsapp || customerWhatsapp,
        payload,
        status: "pending",
      },
    });

    try {
      const recipients = await db.membership.findMany({
        where: {
          organizationId: org.id,
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

      const reviewUrl = `${getAppBaseUrl()}/purchase-orders`;
      const uniqueEmails = Array.from(
        new Set(
          recipients
            .map((recipient) => recipient.user.email.trim().toLowerCase())
            .filter(Boolean)
        )
      );

      await Promise.allSettled(
        uniqueEmails.map((email) =>
          sendPurchaseRequestNotificationEmail({
            to: email,
            organizationName: org.name,
            requesterName: customer.name,
            requesterEmail: customer.email || normalizedEmail,
            requesterWhatsapp: customer.whatsapp || normalizedWhatsapp,
            saleId,
            items: enrichedItems.map((item) => ({
              imei: item.imei,
              model: item.model,
              capacity: item.capacity,
              color: item.color,
              salePrice: item.effectiveOfferMxn,
            })),
            reviewUrl,
          })
        )
      );
    } catch (mailError) {
      console.error("[public-purchase-request] failed to send notification email", {
        organizationId: org.id,
        saleId,
        message: mailError instanceof Error ? mailError.message : String(mailError),
      });
    }

    return NextResponse.json({
      success: true,
      saleId,
      itemCount: enrichedItems.length,
      message: "Purchase request submitted successfully",
    });
  } catch (error) {
    console.error("POST /api/public-purchase-request/[slug] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
