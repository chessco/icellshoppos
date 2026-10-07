import { db } from "../src/lib/db";
import { getStripeForOrg } from "../src/lib/stripe";
import Stripe from "stripe";

async function main() {
  console.log("\n=======================================================");
  console.log("💳 PRUEBA DE INTEGRACIÓN EN VIVO DIRECTO CONTRA STRIPE API");
  console.log("=======================================================\n");

  // 1. Obtener la organización con credenciales de Stripe guardadas en SystemSetting
  const stripeSecretSetting = await db.systemSetting.findFirst({
    where: { key: { endsWith: ":stripe_secret_key" } },
  });

  let stripeClient: Stripe;
  let orgId = "";
  let secretKey = "";

  if (stripeSecretSetting?.value && stripeSecretSetting.value.trim().startsWith("sk_")) {
    secretKey = stripeSecretSetting.value.trim();
    orgId = stripeSecretSetting.key.split(":")[1] || "";
    const org = await db.organization.findUnique({ where: { id: orgId } });
    console.log(`🏢 Organización: ${org?.name || orgId} (${orgId})`);
    console.log(`🔐 Clave Secreta en DB: ${secretKey.substring(0, 12)}... (Modo: ${secretKey.startsWith("sk_test") ? "TEST (Sandbox)" : "LIVE"})`);
    stripeClient = new Stripe(secretKey);
  } else {
    console.log("ℹ️ No se encontró clave personalizada en SystemSetting local. Usando fallback de entorno o clave de prueba...");
    secretKey = process.env.STRIPE_SECRET_KEY || "";
    if (!secretKey.startsWith("sk_")) {
      console.log("⚠️ No hay STRIPE_SECRET_KEY configurada en .env ni en SystemSetting local.");
      console.log("👉 Por favor configure su clave secreta en https://probuyer.pitayacode.io/settings/integrations");
      return;
    }
    stripeClient = new Stripe(secretKey);
  }

  try {
    // 2. Probar conexión y autenticación con Stripe
    console.log("\n📡 1. Verificando autenticación con Stripe API...");
    const account = await stripeClient.accounts.retrieve();
    console.log(`   ✅ Autenticación exitosa! Cuenta Stripe ID: ${account.id} (${account.business_profile?.name || account.settings?.dashboard?.display_name || "Cuenta Principal"})`);

    // 3. Probar Creación de Connection Token para Terminal SDK (iPad)
    console.log("\n📲 2. Solicitando Connection Token para el Terminal SDK en iPad...");
    const token = await stripeClient.terminal.connectionTokens.create();
    console.log(`   ✅ Connection Token generado: ${token.secret.substring(0, 18)}... (Válido para Terminal SDK)`);

    // 4. Probar Creación de PaymentIntent Card-Present (Lector Físico M2)
    console.log("\n💳 3. Creando PaymentIntent Card-Present para Lector Stripe M2...");
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: 1500, // 15.00 MXN
      currency: "mxn",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      description: "Prueba E2E Automatizada desde iPad POS",
      metadata: {
        source: "iPad_POS_Automated_E2E",
        reader_serial: "STRM26146031090",
        test_timestamp: new Date().toISOString(),
      },
    });

    console.log(`   ✅ PaymentIntent creado en Stripe!`);
    console.log(`      • ID: ${paymentIntent.id}`);
    console.log(`      • Monto: $${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()}`);
    console.log(`      • Estado en Stripe: ${paymentIntent.status}`);
    console.log(`      • Ver en Dashboard de Stripe: https://dashboard.stripe.com/test/payments/${paymentIntent.id}`);

    // 5. Probar Creación de Stripe Checkout Session (Pago Online / QR sin terminal)
    console.log("\n🌐 4. Creando Stripe Checkout Session (Modo QR / Link sin terminal)...");
    const checkoutSession = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: "Venta iPad POS - Prueba sin Terminal",
              description: "Pago de prueba mediante Link / Código QR",
            },
            unit_amount: 2500, // 25.00 MXN
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "https://probuyer.pitayacode.io/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://probuyer.pitayacode.io/payment-cancel",
      metadata: {
        source: "iPad_POS_QR_E2E",
      },
    });

    console.log(`   ✅ Checkout Session creada en Stripe!`);
    console.log(`      • Session ID: ${checkoutSession.id}`);
    console.log(`      • URL de Pago: ${checkoutSession.url}`);
    console.log(`      • Monto: $${((checkoutSession.amount_total || 2500) / 100).toFixed(2)} MXN`);

    // 6. Consultar Lectores y Ubicaciones registradas en Stripe
    console.log("\n📍 5. Consultando Ubicaciones y Lectores registrados en la cuenta de Stripe...");
    const locations = await stripeClient.terminal.locations.list({ limit: 5 });
    console.log(`   ✅ Ubicaciones encontradas en Stripe: ${locations.data.length}`);
    locations.data.forEach((loc) => {
      console.log(`      • [${loc.id}] ${loc.display_name} (${loc.address.city || ""}, ${loc.address.country || ""})`);
    });

    const readers = await stripeClient.terminal.readers.list({ limit: 5 });
    console.log(`   ✅ Lectores registrados en Stripe: ${readers.data.length}`);
    readers.data.forEach((r) => {
      console.log(`      • [${r.id}] ${r.label || r.device_type} (Serial: ${r.serial_number}, Estado: ${r.status})`);
    });

    console.log("\n=======================================================");
    console.log("🎉 TODAS LAS OPERACIONES FUERON CONFIRMADAS CONTRA STRIPE API");
    console.log("=======================================================\n");
  } catch (error: any) {
    console.error("❌ Error en la llamada directa a Stripe:", error?.message || error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
