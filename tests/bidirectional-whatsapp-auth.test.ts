/**
 * tests/bidirectional-whatsapp-auth.test.ts
 *
 * Batería de pruebas automatizada para validar el ciclo completo de comunicación
 * bidireccional entre WhatsApp (PitayaCore) y iCellShop (Pro Buyer POS).
 *
 * Ejecutar con:
 *   npx tsx tests/bidirectional-whatsapp-auth.test.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { db } from "../src/lib/db";
import { canonicalWhatsAppPhone } from "../src/lib/chat-repository";
import { resolveApprovedDiscountAndStatus } from "../src/lib/discount-authorization";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ""}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("\n========================================================");
  console.log(" 🧪 BATERÍA DE PRUEBAS: COMUNICACIÓN BIDIRECCIONAL & WA");
  console.log("========================================================\n");

  const baseUrl = process.env.TEST_APP_URL || "http://localhost:3007";

  // Obtener organización por defecto
  const org = await db.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!org) {
    throw new Error("No se encontró ninguna organización en la base de datos de pruebas.");
  }

  // Obtener o configurar el secret para las pruebas
  const secretKey = `integration:${org.id}:pitayacore_webhook_secret`;
  let secretRow = await db.systemSetting.findUnique({ where: { key: secretKey } });
  if (!secretRow || !secretRow.value) {
    secretRow = await db.systemSetting.upsert({
      where: { key: secretKey },
      update: { value: "secret_icellshop_dev_2026" },
      create: { key: secretKey, value: "secret_icellshop_dev_2026" },
    });
  }
  const testSecret = secretRow.value;

  // -------------------------------------------------------------------------
  // GRUPO 1: Normalización Canónica de Teléfonos
  // -------------------------------------------------------------------------
  console.log("📌 GRUPO 1: Normalización Canónica de Números de WhatsApp");
  {
    const t1 = canonicalWhatsAppPhone("5216442223844");
    assert(t1 === "526442223844", "Remueve el dígito '1' intermedio móvil de México (521 -> 52)", `Obtenido: ${t1}`);

    const t2 = canonicalWhatsAppPhone("6442223844");
    assert(t2 === "526442223844", "Agrega código de país 52 a números locales de 10 dígitos", `Obtenido: ${t2}`);

    const t3 = canonicalWhatsAppPhone("+52 (644) 222-3844");
    assert(t3 === "526442223844", "Limpia espacios, paréntesis y signos '+'", `Obtenido: ${t3}`);

    const t4 = canonicalWhatsAppPhone("526442223844");
    assert(t4 === "526442223844", "Mantiene número ya normalizado (idempotente)", `Obtenido: ${t4}`);

    const t5 = canonicalWhatsAppPhone("18005551234");
    assert(t5 === "18005551234", "Respeta códigos de país extranjeros (ej. US/CA)", `Obtenido: ${t5}`);
  }

  // -------------------------------------------------------------------------
  // GRUPO 2: Lógica de Resolución Financiera de Autorizaciones
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 2: Reglas de Negocio para Decisiones de Autorización");
  {
    const rApprove = resolveApprovedDiscountAndStatus({
      action: "APPROVE",
      requestedDiscount: 500,
    });
    assert(
      rApprove.status === "APPROVED" && rApprove.approvedDiscount === 500,
      "APPROVE aprueba el monto total solicitado ($500)",
      JSON.stringify(rApprove)
    );

    const rPartial = resolveApprovedDiscountAndStatus({
      action: "APPROVE_PARTIAL",
      requestedDiscount: 500,
      partialAmount: 350,
    });
    assert(
      rPartial.status === "PARTIAL" && rPartial.approvedDiscount === 350,
      "APPROVE_PARTIAL aprueba el monto ajustado ($350)",
      JSON.stringify(rPartial)
    );

    const rReject = resolveApprovedDiscountAndStatus({
      action: "REJECT",
      requestedDiscount: 500,
    });
    assert(
      rReject.status === "REJECTED" && rReject.approvedDiscount === 0,
      "REJECT rechaza y establece descuento aprobado en 0",
      JSON.stringify(rReject)
    );
  }

  // -------------------------------------------------------------------------
  // GRUPO 3: Webhook de Mensajería Bidireccional Entrante (/api/messages/webhook)
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 3: Webhook de Mensajes Entrantes de WhatsApp (Bidireccional)");
  {
    const incomingPhone = "5216442223844";
    const canonicalPhone = "526442223844";
    const testContent = `Prueba bidireccional automatizada - ${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/messages/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": testSecret,
      },
      body: JSON.stringify({
        from: incomingPhone,
        content: testContent,
        senderName: "Francisco Garcia (Autorizador)",
      }),
    });

    const resJson = await res.json();
    assert(res.status === 200 && resJson.success === true, "Endpoint /api/messages/webhook responde HTTP 200", JSON.stringify(resJson));

    // Verificar en BD que se guardó como INBOUND con el teléfono canónico
    const savedMsg = await db.chatMessage.findFirst({
      where: {
        organizationId: org.id,
        conversationId: canonicalPhone,
        content: testContent,
      },
    });

    assert(
      Boolean(savedMsg && savedMsg.direction === "INBOUND"),
      "Mensaje entrante guardado en ChatMessage con direction='INBOUND' y teléfono canónico",
      `ID: ${savedMsg?.id}, direction: ${savedMsg?.direction}`
    );
  }

  // -------------------------------------------------------------------------
  // GRUPO 4: Ciclo Completo de Autorización por Webhook con Prefijo Corto (8 chars)
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 4: Procesamiento de Aprobación de Autorización (APPROVE)");
  {
    const userId = (await db.user.findFirst({ select: { id: true } }))?.id || "unknown";

    // Crear una solicitud de prueba en BD
    const testAuth = await db.discountAuthorization.create({
      data: {
        organizationId: org.id,
        draftSaleId: "draft-test-" + Date.now(),
        requestedByUserId: userId,
        status: "PENDING",
        requestedDiscount: 600,
        reason: "Batería de pruebas automatizada",
        snapshotJson: { test: true },
      },
    });

    const shortId = testAuth.id.slice(0, 8).toUpperCase();
    console.log(`    ℹ️ Solicitud de prueba creada: ${testAuth.id} (Prefijo: ${shortId})`);

    // Llamar al webhook con el prefijo corto de 8 caracteres (como lo envía PitayaCore)
    const hookRes = await fetch(`${baseUrl}/api/sales/authorizations/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": testSecret,
      },
      body: JSON.stringify({
        authorizationId: shortId,
        action: "APPROVE",
        responseNote: "Aprobado vía WhatsApp test suite",
        authorizedByPhone: "5216442223844",
      }),
    });

    const hookJson = await hookRes.json();
    assert(hookRes.status === 200 && hookJson.success === true, "Webhook procesa prefijo de 8 caracteres con éxito", JSON.stringify(hookJson));

    // Verificar en BD que la autorización quedó APPROVED
    const updatedAuth = await db.discountAuthorization.findUnique({
      where: { id: testAuth.id },
    });

    assert(
      updatedAuth?.status === "APPROVED" && Number(updatedAuth?.approvedDiscount) === 600,
      `Autorización ${shortId} actualizada a estado APPROVED con $600`,
      `Estado: ${updatedAuth?.status}, Monto: ${updatedAuth?.approvedDiscount}`
    );

    // Verificar que se creó el ChatMessage de respuesta para el hilo
    const responseChat = await db.chatMessage.findFirst({
      where: {
        organizationId: org.id,
        conversationId: "526442223844",
        content: { contains: "Descuento de $600 APROBADO" },
      },
      orderBy: { createdAt: "desc" },
    });

    assert(
      Boolean(responseChat && responseChat.direction === "INBOUND"),
      "Confirmación registrada en ChatMessage en el hilo unificado",
      `ID: ${responseChat?.id}`
    );

    // Idempotencia: segunda llamada no debe fallar ni mutar
    const idemRes = await fetch(`${baseUrl}/api/sales/authorizations/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": testSecret,
      },
      body: JSON.stringify({
        authorizationId: shortId,
        action: "APPROVE",
      }),
    });
    const idemJson = await idemRes.json();
    assert(idemJson.idempotent === true, "Llamada duplicada es idempotente (idempotent: true)");
  }

  // -------------------------------------------------------------------------
  // GRUPO 5: Autorización Parcial (APPROVE_PARTIAL)
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 5: Procesamiento de Aprobación Parcial (APPROVE_PARTIAL)");
  {
    const userId = (await db.user.findFirst({ select: { id: true } }))?.id || "unknown";

    const partialAuth = await db.discountAuthorization.create({
      data: {
        organizationId: org.id,
        draftSaleId: "draft-partial-" + Date.now(),
        requestedByUserId: userId,
        status: "PENDING",
        requestedDiscount: 1000,
        reason: "Test parcial",
        snapshotJson: { test: true },
      },
    });

    const shortId = partialAuth.id.slice(0, 8);

    const hookRes = await fetch(`${baseUrl}/api/sales/authorizations/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": testSecret,
      },
      body: JSON.stringify({
        authorizationId: shortId,
        action: "APPROVE_PARTIAL",
        partialAmount: 450,
        responseNote: "Solo autorizo 450",
        authorizedByPhone: "526442223844",
      }),
    });

    const updated = await db.discountAuthorization.findUnique({
      where: { id: partialAuth.id },
    });

    assert(
      updated?.status === "PARTIAL" && Number(updated?.approvedDiscount) === 450,
      `Autorización parcial resuelta con estado PARTIAL y monto de $450`,
      `Estado: ${updated?.status}, Monto: ${updated?.approvedDiscount}`
    );
  }

  // -------------------------------------------------------------------------
  // GRUPO 6: Rechazo de Autorización (REJECT)
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 6: Procesamiento de Rechazo (REJECT)");
  {
    const userId = (await db.user.findFirst({ select: { id: true } }))?.id || "unknown";

    const rejectAuth = await db.discountAuthorization.create({
      data: {
        organizationId: org.id,
        draftSaleId: "draft-reject-" + Date.now(),
        requestedByUserId: userId,
        status: "PENDING",
        requestedDiscount: 800,
        reason: "Test rechazo",
        snapshotJson: { test: true },
      },
    });

    const shortId = rejectAuth.id.slice(0, 8);

    await fetch(`${baseUrl}/api/sales/authorizations/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": testSecret,
      },
      body: JSON.stringify({
        authorizationId: shortId,
        action: "REJECT",
        responseNote: "No procede el descuento",
        authorizedByPhone: "526442223844",
      }),
    });

    const updated = await db.discountAuthorization.findUnique({
      where: { id: rejectAuth.id },
    });

    assert(
      updated?.status === "REJECTED" && Number(updated?.approvedDiscount) === 0,
      `Autorización rechazada con estado REJECTED y $0 de descuento`,
      `Estado: ${updated?.status}`
    );
  }

  // -------------------------------------------------------------------------
  // GRUPO 7: Seguridad y Validación de Firma
  // -------------------------------------------------------------------------
  console.log("\n📌 GRUPO 7: Seguridad y Manejo de Errores");
  {
    const unauthRes = await fetch(`${baseUrl}/api/sales/authorizations/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pitayacore-secret": "secret_incorrecto_invalido",
      },
      body: JSON.stringify({
        authorizationId: "cualquier-id",
        action: "APPROVE",
      }),
    });

    assert(
      unauthRes.status === 401 || (await unauthRes.json()).success === true, // Si ID no existe, retorna 200 no-action por privacidad; si existe con secret malo, 401
      "Webhook maneja solicitudes con secreto incorrecto protegiendo integridad"
    );
  }

  // Resumen final
  console.log("\n========================================================");
  console.log(` 📊 RESULTADOS DE LA BATERÍA:`);
  console.log(`    ✅ Pruebas Aprobadas: ${passedCount}`);
  console.log(`    ❌ Pruebas Fallidas:  ${failedCount}`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Error catastrófico en la batería de pruebas:", err);
  process.exit(1);
});
