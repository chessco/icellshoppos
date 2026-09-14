import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

type PurchaseOrderItem = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  cost: number;
  price: number;
  tierName?: string;
  tierPriceMxn?: number;
  offerAmountRaw?: string | null;
  offerCurrency?: "MXN" | "USD";
  offerAmountMxn?: number | null;
  effectiveOfferMxn?: number;
  differenceMxn?: number;
  offerAccepted?: boolean;
  isSold?: boolean;
};

type PurchaseOrder = {
  requestId: string;
  saleId: string;
  customer: string;
  customerEmail: string;
  whatsapp: string;
  createdAt: string;
  status: string;
  offersEnabled?: boolean;
  allOffersAccepted?: boolean;
  items: PurchaseOrderItem[];
};

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeInventoryStatus = (value: unknown) => String(value ?? "").trim().toLowerCase();

const isSoldOrUnavailableStatus = (status: string) => {
  if (!status) return true;
  return status !== "available";
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedStatus = String(searchParams.get("status") ?? "pending").trim().toLowerCase();
    const statusMap: Record<string, string[]> = {
      pending: ["pending"],
      completed: ["completed", "fulfilled"],
      expired: ["expired"],
      deleted: ["deleted", "cancelled"],
      all: ["pending", "completed", "fulfilled", "expired", "deleted", "cancelled"],
    };
    const statuses = statusMap[requestedStatus] ?? statusMap.pending;

    const records = await db.purchaseRequest.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { in: statuses },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        requesterName: true,
        requesterEmail: true,
        requesterWhatsapp: true,
        payload: true,
        createdAt: true,
      },
    });

    const imeis = Array.from(
      new Set(
        records.flatMap((record) => {
          const payload = isRecord(record.payload) ? record.payload : {};
          const payloadItems = Array.isArray(payload.items) ? payload.items : [];
          return payloadItems
            .map((item) => (isRecord(item) ? String(item.imei ?? "").trim() : ""))
            .filter(Boolean);
        })
      )
    );

    const inventoryStatusRows = imeis.length
      ? await db.inventoryItem.findMany({
          where: {
            organizationId: membership.organizationId,
            imei: { in: imeis },
          },
          select: {
            imei: true,
            status: true,
          },
        })
      : [];

    const inventoryStatusByImei = new Map(
      inventoryStatusRows.map((row) => [String(row.imei).trim(), normalizeInventoryStatus(row.status)] as const)
    );

    const pendingIdsToExpire: string[] = [];

    const orders: PurchaseOrder[] = records
      .map((record) => {
        const payload = isRecord(record.payload) ? record.payload : {};
        const payloadItems = Array.isArray(payload.items) ? payload.items : [];

        const items = payloadItems.reduce<PurchaseOrderItem[]>((acc, item) => {
          if (!isRecord(item)) return acc;

          const tierName = String(item.tierName ?? "").trim();

          acc.push({
            imei: String(item.imei ?? ""),
            model: String(item.model ?? ""),
            capacity: String(item.capacity ?? ""),
            color: String(item.color ?? ""),
            cost: toNumber(item.costPesos),
            price: toNumber(item.price),
            tierName: tierName || undefined,
            tierPriceMxn: toNumber(item.tierPriceMxn),
            offerAmountRaw: item.offerAmountRaw == null ? null : String(item.offerAmountRaw),
            offerCurrency: item.offerCurrency === "USD" ? "USD" : "MXN",
            offerAmountMxn: item.offerAmountMxn == null ? null : toNumber(item.offerAmountMxn),
            effectiveOfferMxn: toNumber(item.effectiveOfferMxn),
            differenceMxn: toNumber(item.differenceMxn),
            offerAccepted: Boolean(item.offerAccepted),
            isSold: isSoldOrUnavailableStatus(
              inventoryStatusByImei.get(String(item.imei ?? "").trim()) ?? ""
            ),
          });

          return acc;
        }, []);

        const saleId = String(payload.saleId ?? "").trim() || `PR-${record.id.slice(0, 8)}`;

        const offersEnabled = Boolean(payload.offersEnabled);
        const allOffersAccepted = offersEnabled
          ? items.every((item) => item.offerAccepted)
          : true;

        const hasAvailableItems = items.some((item) => !item.isSold);
        const normalizedStatus = String(record.status ?? "pending").trim().toLowerCase();
        const shouldExpire = normalizedStatus === "pending" && !hasAvailableItems;

        if (shouldExpire) {
          pendingIdsToExpire.push(record.id);
        }

        return {
          requestId: record.id,
          saleId,
          customer: String(payload.customerName ?? record.requesterName ?? ""),
          customerEmail: String(payload.customerEmail ?? record.requesterEmail ?? ""),
          whatsapp: String(payload.customerWhatsapp ?? record.requesterWhatsapp ?? ""),
          createdAt: String(payload.createdAt ?? record.createdAt.getTime()),
          status: shouldExpire ? "expired" : String(record.status ?? "pending"),
          offersEnabled,
          allOffersAccepted,
          items,
        };
      })
      .filter((order) => order.items.length > 0);

    if (pendingIdsToExpire.length > 0) {
      await db.purchaseRequest.updateMany({
        where: {
          id: { in: pendingIdsToExpire },
          organizationId: membership.organizationId,
          status: "pending",
        },
        data: {
          status: "expired",
        },
      });
    }

    return NextResponse.json({ orders, status: requestedStatus });
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
