import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentHandoffService } from "@/lib/payments/payment-handoff-service";
import { PaymentValidationError } from "@/lib/payments/validation";
import { PaymentHandoffStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions } = access;
    const { id } = await params;

    if (!permissions.canCreateSales) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !Object.values(PaymentHandoffStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }

    const handoff = await defaultPaymentHandoffService.updateStatus({
      organizationId,
      handoffId: id,
      status,
    });

    return NextResponse.json({ ok: true, handoff });
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to update handoff status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
