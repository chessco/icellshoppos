import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultPaymentOrchestrator } from "@/lib/payments/payment-orchestrator";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { session, organizationId, permissions } = access;

    if (!permissions.canCreateSales) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions to initialize POS terminal." }, { status: 403 });
    }

    let posDeviceId: string | undefined;
    let locationId: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      posDeviceId = body?.posDeviceId ? String(body.posDeviceId).trim() : undefined;
      locationId = body?.locationId ? String(body.locationId).trim() : undefined;
    } catch {
      // Body is optional
    }

    const token = await defaultPaymentOrchestrator.createConnectionToken({
      organizationId,
      userId: session.userId,
      posDeviceId,
      locationId,
    });

    return NextResponse.json({ secret: token.secret });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[payments/stripe/connection-token] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Stripe connection token" },
      { status: 500 }
    );
  }
}
