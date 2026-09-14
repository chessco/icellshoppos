import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = String(body?.requestId ?? "").trim();
    const imei = String(body?.imei ?? "").trim();

    if (!requestId || !imei) {
      return NextResponse.json({ error: "requestId and imei are required." }, { status: 400 });
    }

    const record = await db.purchaseRequest.findFirst({
      where: {
        id: requestId,
        organizationId: membership.organizationId,
        status: "pending",
      },
      select: {
        id: true,
        payload: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Purchase request not found." }, { status: 404 });
    }

    const payload = isRecord(record.payload) ? record.payload : {};
    const payloadItems = Array.isArray(payload.items) ? payload.items : [];

    const nextItems = payloadItems.map((item) => {
      if (!isRecord(item)) return item;
      if (String(item.imei ?? "") !== imei) return item;
      return {
        ...item,
        offerAccepted: true,
      };
    });

    const found = nextItems.some((item) => isRecord(item) && String(item.imei ?? "") === imei);
    if (!found) {
      return NextResponse.json({ error: "Offer item not found for this request." }, { status: 404 });
    }

    const offersEnabled = Boolean(payload.offersEnabled);
    const allOffersAccepted = offersEnabled
      ? nextItems.every((item) => !isRecord(item) || Boolean(item.offerAccepted))
      : true;

    const nextPayload = {
      ...payload,
      items: nextItems,
      allOffersAccepted,
    };

    await db.purchaseRequest.update({
      where: { id: record.id },
      data: {
        payload: nextPayload,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      imei,
      allOffersAccepted,
    });
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
