import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { callImeiCheck2Endpoint } from "@/lib/imeicheck2";
import { ensureValidConfirmationToken } from "../_shared";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const body = await request.json().catch(() => ({}));
    const limitRaw = Number(body?.limit ?? 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 25;

    const tokenResult = await ensureValidConfirmationToken(access.organizationId);
    if (!tokenResult.ok) {
      return NextResponse.json({ error: tokenResult.error }, { status: tokenResult.status });
    }

    const external = await callImeiCheck2Endpoint("/api/external/orders", {
      confirmation_token: tokenResult.token,
      limit,
    });

    return NextResponse.json(external.payload, { status: external.status });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
