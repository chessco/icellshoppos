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

    // Helper to get Stripe client
    const getStripeClient = async () => {
      let secretKey = body.stripe_secret_key?.trim();
      if (!secretKey) {
        const row = await db.systemSetting.findUnique({
          where: { key: `${prefix}stripe_secret_key` },
        });
        secretKey = row?.value;
      }
      if (!secretKey) {
        secretKey = process.env.STRIPE_SECRET_KEY;
      }
      if (!secretKey || !secretKey.startsWith("sk_")) {
        throw new Error("La clave Stripe Secret Key (sk_...) es requerida y debe comenzar con sk_.");
      }
      return {
        stripe: new Stripe(secretKey, { apiVersion: "2026-02-25.clover" as any }),
        secretKey,
      };
    };

    // Action: Test Stripe Connection
    if (body.action === "test_stripe") {
      try {
        const { stripe: testClient, secretKey } = await getStripeClient();

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

    // Action: List Locations
    if (body.action === "list_stripe_locations") {
      try {
        const { stripe } = await getStripeClient();
        const locations = await stripe.terminal.locations.list({ limit: 20 });
        return NextResponse.json({
          success: true,
          locations: locations.data.map((l) => ({
            id: l.id,
            displayName: l.display_name,
            address: l.address,
          })),
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || "Error al consultar ubicaciones de Stripe." },
          { status: 400 }
        );
      }
    }

    // Action: Create Location
    if (body.action === "create_stripe_location") {
      try {
        const { stripe } = await getStripeClient();
        const location = await stripe.terminal.locations.create({
          display_name: body.displayName?.trim() || "Tienda Principal iCellShop",
          address: {
            line1: body.line1?.trim() || "Av. Principal 123",
            city: body.city?.trim() || "Puebla",
            state: body.state?.trim() || "Puebla",
            country: "MX",
            postal_code: body.postalCode?.trim() || "72000",
          },
        });

        // Save as default if requested
        if (body.saveAsDefault) {
          const locKey = `${prefix}stripe_location_id`;
          await db.systemSetting.upsert({
            where: { key: locKey },
            update: { value: location.id },
            create: { key: locKey, value: location.id },
          });
        }

        return NextResponse.json({
          success: true,
          location: {
            id: location.id,
            displayName: location.display_name,
            address: location.address,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || "Error al crear ubicación en Stripe." },
          { status: 400 }
        );
      }
    }

    // Action: List Readers
    if (body.action === "list_stripe_readers") {
      try {
        const { stripe } = await getStripeClient();
        const readers = await stripe.terminal.readers.list({
          location: body.locationId || undefined,
          limit: 30,
        });
        return NextResponse.json({
          success: true,
          readers: readers.data.map((r) => ({
            id: r.id,
            label: r.label,
            deviceType: r.device_type,
            serialNumber: r.serial_number,
            status: r.status,
            location: r.location,
            ipAddress: r.ip_address,
          })),
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || "Error al consultar lectores de Stripe." },
          { status: 400 }
        );
      }
    }

    // Action: Register Reader (Physical or Simulated)
    if (body.action === "register_stripe_reader") {
      try {
        const { stripe } = await getStripeClient();
        const code = body.registrationCode?.trim();
        if (!code) {
          return NextResponse.json(
            { success: false, error: "El código de registro (registration_code) es requerido." },
            { status: 400 }
          );
        }

        const reader = await stripe.terminal.readers.create({
          registration_code: code,
          label: body.label?.trim() || "Terminal iCellShop",
          location: body.locationId || undefined,
        });

        return NextResponse.json({
          success: true,
          reader: {
            id: reader.id,
            label: reader.label,
            deviceType: reader.device_type,
            serialNumber: reader.serial_number,
            status: reader.status,
            location: reader.location,
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || "Error al registrar el lector en Stripe." },
          { status: 400 }
        );
      }
    }

    // Action: Test Charge (PaymentIntent creation & verification)
    if (body.action === "test_stripe_charge") {
      try {
        const { stripe, secretKey } = await getStripeClient();
        const isTestMode = secretKey.startsWith("sk_test_");
        const amount = Math.max(10, Number(body.amount || 10));

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: (body.currency || "mxn").toLowerCase(),
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          description: "Prueba de Terminal iReader POS",
          metadata: {
            organizationId: orgId,
            testMode: isTestMode ? "true" : "false",
            createdFrom: "Settings Integrations Test Runner",
          },
        });

        const dashboardUrl = `https://dashboard.stripe.com/${isTestMode ? "test/" : ""}payments/${paymentIntent.id}`;

        return NextResponse.json({
          success: true,
          paymentIntent: {
            id: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
            dashboardUrl,
          },
          message: `PaymentIntent ${paymentIntent.id} creado con éxito por $${amount.toFixed(2)} ${paymentIntent.currency.toUpperCase()}.`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || "Error al crear cobro de prueba en Stripe." },
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

