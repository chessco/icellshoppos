import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentHandoffService } from "@/lib/payments/payment-handoff-service";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    const devices = await defaultPaymentHandoffService.getAvailableTargetDevices({
      organizationId,
      siteId: siteId ? String(siteId).trim() : null,
    });

    return NextResponse.json({ ok: true, devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to query available POS devices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
