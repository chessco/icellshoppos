import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentHandoffService } from "@/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await getRequestOrgAccess(request);
    const { session, organizationId, permissions } = access;
    const { id } = await params;

    if (!permissions.canCreateSales) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { targetDeviceId, reason } = body;

    const handoff = await defaultPaymentHandoffService.rejectHandoff({
      organizationId,
      userId: session.userId,
      handoffId: id,
      targetDeviceId: targetDeviceId ? String(targetDeviceId).trim() : null,
      reason: reason ? String(reason).trim() : undefined,
    });

    return NextResponse.json({ ok: true, handoff });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to reject payment handoff.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
