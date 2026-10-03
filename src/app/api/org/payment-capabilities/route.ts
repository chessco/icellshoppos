import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import {
  DEFAULT_PAYMENT_CAPABILITIES,
  normalizePaymentCapabilities,
  resolvePaymentCapabilities,
} from "@/lib/payments/payment-capabilities";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || undefined;

    const capabilities = await resolvePaymentCapabilities(db, organizationId, siteId);

    return NextResponse.json({
      capabilities,
      defaults: DEFAULT_PAYMENT_CAPABILITIES,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/payment-capabilities] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId, permissions } = access;

    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions to manage payment capabilities." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { capabilities: incomingCapabilities, siteId } = body as {
      capabilities?: unknown;
      siteId?: string;
    };

    const normalized = normalizePaymentCapabilities(incomingCapabilities);

    if (siteId) {
      const site = await db.site.findFirst({
        where: { id: siteId, organizationId },
      });
      if (!site) {
        return NextResponse.json({ error: "Site not found for this organization" }, { status: 404 });
      }

      await db.site.update({
        where: { id: siteId },
        data: {
          paymentCapabilitiesJson: normalized as any,
          ...(normalized.stripeLocationId !== undefined ? { stripeLocationId: normalized.stripeLocationId } : {}),
        },
      });
    } else {
      await db.organization.update({
        where: { id: organizationId },
        data: {
          paymentCapabilitiesJson: normalized as any,
        },
      });
    }

    const effective = await resolvePaymentCapabilities(db, organizationId, siteId);
    return NextResponse.json({ capabilities: effective });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/payment-capabilities] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
