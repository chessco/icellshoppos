import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { mergeCatalogWithPricing, normalizePricingRows } from "@/lib/imeicheck2-catalog";
import { getImeiCheck2Integration } from "../_shared";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const integration = await getImeiCheck2Integration(access.organizationId);

    if (!integration) {
      return NextResponse.json({ error: "imeicheck2 integration is not linked." }, { status: 404 });
    }

    const pricingRows = normalizePricingRows(integration.servicePricingJson);
    const mergedServices = mergeCatalogWithPricing(pricingRows);

    return NextResponse.json({
      success: true,
      services: mergedServices,
      balance: integration.balance === null ? null : Number(integration.balance),
      balanceUpdatedAt: integration.balanceUpdatedAt?.toISOString() ?? null,
      pricingUpdatedAt: integration.pricingUpdatedAt?.toISOString() ?? null,
      warning: pricingRows.length === 0 ? "No stored pricing found yet. Re-link to sync current prices." : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
