import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentHandoffService } from "@/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "@/lib/payments/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing handoff ID." }, { status: 400 });
    }

    const handoff = await defaultPaymentHandoffService.getHandoff({
      organizationId,
      handoffId: id,
    });

    return NextResponse.json({ ok: true, handoff });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve handoff status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
