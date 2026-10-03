import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentHandoffService } from "@/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { session, organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions to initiate payment handoffs." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      saleId,
      siteId,
      sourceDeviceId,
      targetDeviceId,
      amount,
      currency = "mxn",
      idempotencyKey,
      notes,
    } = body;

    if (amount === undefined || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "A valid positive numeric amount is required." },
        { status: 400 }
      );
    }

    const result = await defaultPaymentHandoffService.createHandoff({
      organizationId,
      userId: session.userId,
      siteId: siteId ? String(siteId).trim() : null,
      saleId: saleId ? String(saleId).trim() : null,
      sourceDeviceId: sourceDeviceId ? String(sourceDeviceId).trim() : null,
      targetDeviceId: targetDeviceId ? String(targetDeviceId).trim() : null,
      amount,
      currency: String(currency).toLowerCase(),
      idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        handoffId: result.handoff.id,
        handoff: result.handoff,
        clientSecret: result.clientSecret,
        stripePaymentIntentId: result.stripePaymentIntentId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to create payment handoff.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const targetDeviceId = searchParams.get("targetDeviceId");

    const handoffs = await defaultPaymentHandoffService.getPendingHandoffs({
      organizationId,
      siteId: siteId ? String(siteId).trim() : null,
      targetDeviceId: targetDeviceId ? String(targetDeviceId).trim() : null,
    });

    return NextResponse.json({ ok: true, handoffs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to query pending handoffs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
