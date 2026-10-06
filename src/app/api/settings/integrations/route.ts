import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { db } from "@/lib/db";
import Stripe from "stripe";

const DEFAULT_SETTINGS = {
  whatsapp_provider: "PITAYACORE",
  pitayacore_api_url: process.env.PITAYACORE_API_URL || "https://pitayacore-api.pitayacode.io/api",
  pitayacore_api_key: process.env.PITAYACORE_API_KEY || "",
  pitayacore_tenant_id: process.env.PITAYACORE_TENANT_ID || "",
  pitayacore_agent_slug: "icellshop-autorizaciones",
  pitayacore_authorizer_phone: "",
  pitayacore_webhook_secret: "",
  flow_api_url: process.env.FLOW_API_URL || "https://flow-api.pitayacode.io",
  flow_internal_key: process.env.FLOW_INTERNAL_KEY || "",
  stripe_mode: "live",
  stripe_secret_key: process.env.STRIPE_SECRET_KEY || "",
  stripe_publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripe_location_id: "",
  stripe_account_id: "",
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = membership.organizationId;
    const prefix = `integration:${orgId}:`;

    // Fetch settings for this organization
    const settingsRows = await db.systemSetting.findMany({
      where: {
        key: { startsWith: prefix },
      },
    });

    const result: Record<string, string> = { ...DEFAULT_SETTINGS };

    for (const row of settingsRows) {
      const fieldKey = row.key.replace(prefix, "");
      result[fieldKey] = row.value;
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const orgId = membership.organizationId;
    const prefix = `integration:${orgId}:`;

    // Action: Test Stripe Connection
    if (body.action === "test_stripe") {
      const secretKey =
        body.stripe_secret_key?.trim() ||
        (
          await db.systemSetting.findUnique({
            where: { key: `${prefix}stripe_secret_key` },
          })
        )?.value ||
        process.env.STRIPE_SECRET_KEY;

      if (!secretKey || !secretKey.startsWith("sk_")) {
        return NextResponse.json(
          { error: "La clave Stripe Secret Key (sk_...) es requerida y debe comenzar con sk_." },
          { status: 400 }
        );
      }

      try {
        const testClient = new Stripe(secretKey, {
          apiVersion: "2026-02-25.clover" as any,
        });

        // Query Stripe Account / Balance to verify valid authentication
        const [account, balance] = await Promise.all([
          testClient.accounts.retrieve().catch(() => null),
          testClient.balance.retrieve().catch(() => null),
        ]);

        const livemode = secretKey.startsWith("sk_live_");
        const accountId = account?.id || "Direct API Key";
        const businessName =
          account?.business_profile?.name ||
          account?.settings?.dashboard?.display_name ||
          account?.email ||
          "Stripe Merchant";
        const primaryCurrency =
          balance?.available?.[0]?.currency?.toUpperCase() ||
          account?.default_currency?.toUpperCase() ||
          "MXN";

        return NextResponse.json({
          success: true,
          connected: true,
          livemode,
          accountId,
          businessName,
          primaryCurrency,
          message: `Conexión exitosa con Stripe (${livemode ? "Modo Real / Producción" : "Modo Pruebas / Sandbox"}).`,
        });
      } catch (stripeErr: any) {
        return NextResponse.json(
          {
            success: false,
            connected: false,
            error: stripeErr?.message || "Error al autenticar con Stripe API.",
          },
          { status: 400 }
        );
      }
    }

    const allowedKeys = [
      "whatsapp_provider",
      "pitayacore_api_url",
      "pitayacore_api_key",
      "pitayacore_tenant_id",
      "pitayacore_agent_slug",
      "pitayacore_authorizer_phone",
      "pitayacore_webhook_secret",
      "flow_api_url",
      "flow_internal_key",
      "stripe_mode",
      "stripe_secret_key",
      "stripe_publishable_key",
      "stripe_webhook_secret",
      "stripe_location_id",
      "stripe_account_id",
    ];

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const fullKey = `${prefix}${key}`;
        await db.systemSetting.upsert({
          where: { key: fullKey },
          update: { value: String(body[key] ?? "") },
          create: { key: fullKey, value: String(body[key] ?? "") },
        });
      }
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

