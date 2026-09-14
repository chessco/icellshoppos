import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { encryptSecret } from "@/lib/integration-secrets";
import { callImeiCheck2Init } from "@/lib/imeicheck2";
import { normalizePricingRows } from "@/lib/imeicheck2-catalog";
import { getImeiCheck2Integration, IMEICHECK2_PROVIDER, refreshImeiCheck2Balance } from "./_shared";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const integration = await getImeiCheck2Integration(access.organizationId);

    if (!integration) {
      return NextResponse.json({ linked: false });
    }

    const expiresInSeconds = integration.tokenExpiresAt
      ? Math.max(0, Math.floor((integration.tokenExpiresAt.getTime() - Date.now()) / 1000))
      : 0;

    return NextResponse.json({
      linked: true,
      email: integration.email,
      keyLast4: integration.keyLast4,
      tokenValid: expiresInSeconds > 0,
      tokenExpiresIn: expiresInSeconds,
      pricingUpdatedAt: integration.pricingUpdatedAt?.toISOString() ?? null,
      balance: integration.balance === null ? null : Number(integration.balance),
      balanceUpdatedAt: integration.balanceUpdatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const apiKey = String(body?.apiKey ?? "").trim();

    if (!email || !apiKey) {
      return NextResponse.json({ error: "email and apiKey are required." }, { status: 400 });
    }

    if (/^post\s+https?:\/\//i.test(apiKey) || /internal server error|bad request|fetch failed/i.test(apiKey)) {
      return NextResponse.json({
        error: "Invalid API key value. Paste your imeicheck provider API key, not a browser/network error message.",
      }, { status: 400 });
    }

    const initResult = await callImeiCheck2Init({ apiKey, email });
    if (!initResult.ok) {
      const upstreamStatus = Number(initResult.status || 0);
      const status = upstreamStatus === 400 || upstreamStatus === 401 || upstreamStatus === 403 ? 400 : 502;
      return NextResponse.json({
        error: initResult.error,
        upstreamStatus: upstreamStatus || undefined,
      }, { status });
    }

    const keyLast4 = apiKey.slice(-4).padStart(4, "*");
    const tokenExpiresAt = new Date(Date.now() + Math.max(60, initResult.expiresIn) * 1000);
    const normalizedPricing = normalizePricingRows(initResult.pricing);
    const pricingUpdatedAtRaw = String(initResult.pricingUpdatedAt ?? "").trim();
    const pricingUpdatedAt = pricingUpdatedAtRaw ? new Date(pricingUpdatedAtRaw) : new Date();
    const safePricingUpdatedAt = Number.isNaN(pricingUpdatedAt.getTime()) ? new Date() : pricingUpdatedAt;
    const initBalance = Number(initResult.balance);
    const safeInitBalance = Number.isFinite(initBalance) ? initBalance : null;

    await db.externalIntegrationCredential.upsert({
      where: {
        organizationId_provider: {
          organizationId: access.organizationId,
          provider: IMEICHECK2_PROVIDER,
        },
      },
      create: {
        organizationId: access.organizationId,
        provider: IMEICHECK2_PROVIDER,
        email,
        apiKeyEncrypted: encryptSecret(apiKey),
        keyLast4,
        confirmationToken: initResult.token,
        tokenExpiresAt,
        servicePricingJson: normalizedPricing,
        pricingUpdatedAt: safePricingUpdatedAt,
        balance: safeInitBalance,
        balanceUpdatedAt: safeInitBalance === null ? null : new Date(),
        linkedAt: new Date(),
      },
      update: {
        email,
        apiKeyEncrypted: encryptSecret(apiKey),
        keyLast4,
        confirmationToken: initResult.token,
        tokenExpiresAt,
        servicePricingJson: normalizedPricing,
        pricingUpdatedAt: safePricingUpdatedAt,
        balance: safeInitBalance,
        balanceUpdatedAt: safeInitBalance === null ? null : new Date(),
        linkedAt: new Date(),
      },
    });

    await refreshImeiCheck2Balance(access.organizationId).catch(() => null);

    return NextResponse.json({
      success: true,
      linked: true,
      email,
      keyLast4,
      tokenExpiresIn: Math.max(60, initResult.expiresIn),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes("INTEGRATION_ENCRYPTION_KEY")) {
      return NextResponse.json({
        error: "Server configuration error: missing INTEGRATION_ENCRYPTION_KEY (or SESSION_SECRET/JWT_SECRET).",
      }, { status: 500 });
    }
    if (error instanceof Error && /externalintegrationcredential|does not exist|table/i.test(error.message)) {
      return NextResponse.json({
        error: "Database migration missing for external integrations. Run prisma migrate deploy.",
      }, { status: 500 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.externalIntegrationCredential.deleteMany({
      where: {
        organizationId: access.organizationId,
        provider: IMEICHECK2_PROVIDER,
      },
    });

    return NextResponse.json({ success: true, linked: false });
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
