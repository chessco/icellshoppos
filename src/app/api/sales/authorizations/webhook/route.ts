/**
 * POST /api/sales/authorizations/webhook
 *
 * Endpoint llamado por PitayaCore (agente icellshop-autorizaciones) cuando el autorizador
 * responde por WhatsApp con su decisión sobre un descuento especial.
 *
 * El agente interpreta la respuesta en lenguaje natural y envía un payload estructurado:
 * {
 *   authorizationId: string,          // UUID de la DiscountAuthorization en Pro Buyer
 *   action: "APPROVE" | "APPROVE_PARTIAL" | "REJECT",
 *   partialAmount?: number,           // Solo para APPROVE_PARTIAL
 *   responseNote?: string,            // Texto original del autorizador
 *   authorizedByPhone?: string,       // Número WA del autorizador
 * }
 *
 * Seguridad: verifica el header x-pitayacore-secret contra el valor guardado en DB.
 * Idempotente: si la autorización ya fue respondida, retorna 200 sin modificar.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import {
  resolveApprovedDiscountAndStatus,
  type ReviewAction,
} from "@/lib/discount-authorization";

// Endpoint público — no requiere sesión de usuario, pero sí secret de webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const authorizationId = String(body.authorizationId || "").trim();
    const action = String(body.action || "").trim().toUpperCase() as ReviewAction;
    const partialAmount = body.partialAmount !== undefined ? Number(body.partialAmount) : undefined;
    const responseNote = body.responseNote ? String(body.responseNote).trim() : null;
    const authorizedByPhone = body.authorizedByPhone ? String(body.authorizedByPhone).trim() : null;
    const incomingSecret = request.headers.get("x-pitayacore-secret") || "";

    // --- 1. Validar payload básico ---
    if (!authorizationId) {
      return NextResponse.json({ error: "authorizationId requerido." }, { status: 400 });
    }

    if (!["APPROVE", "APPROVE_PARTIAL", "REJECT"].includes(action)) {
      return NextResponse.json(
        { error: "action inválido. Debe ser APPROVE, APPROVE_PARTIAL o REJECT." },
        { status: 400 }
      );
    }

    // --- 2. Buscar la autorización para obtener organizationId ---
    const authorization = await db.discountAuthorization.findUnique({
      where: { id: authorizationId },
    });

    if (!authorization) {
      // Responder 200 para no exponer existencia del recurso a llamadas no autorizadas
      return NextResponse.json({ success: true, message: "No action taken." });
    }

    // --- 3. Verificar secret del webhook contra la configuración de la organización ---
    const orgId = authorization.organizationId;
    const secretRow = await db.systemSetting.findUnique({
      where: { key: `integration:${orgId}:pitayacore_webhook_secret` },
    });

    const expectedSecret = secretRow?.value || "";

    // Si hay un secret configurado, verificarlo. Si no hay secret configurado, rechazar.
    if (!expectedSecret) {
      console.warn(`[Webhook] No hay pitayacore_webhook_secret configurado para org ${orgId}. Rechazando.`);
      return NextResponse.json({ error: "Webhook no configurado para esta organización." }, { status: 401 });
    }

    if (incomingSecret !== expectedSecret) {
      console.warn(`[Webhook] Secret inválido para org ${orgId}. Header recibido: "${incomingSecret}"`);
      return NextResponse.json({ error: "Firma de webhook inválida." }, { status: 401 });
    }

    // --- 4. Idempotencia: si ya fue respondida, retornar 200 sin modificar ---
    if (authorization.status !== "PENDING") {
      console.log(
        `[Webhook] Autorización ${authorizationId} ya procesada con estado ${authorization.status}. Ignorando.`
      );
      return NextResponse.json({
        success: true,
        message: `La solicitud ya fue procesada con estado ${authorization.status}.`,
        idempotent: true,
      });
    }

    // --- 5. Resolver la decisión usando la misma lógica del PATCH manual ---
    let resolution: ReturnType<typeof resolveApprovedDiscountAndStatus>;
    try {
      resolution = resolveApprovedDiscountAndStatus({
        action,
        requestedDiscount: Number(authorization.requestedDiscount),
        partialAmount,
      });
    } catch (valErr) {
      return NextResponse.json(
        { error: valErr instanceof Error ? valErr.message : "Error de validación." },
        { status: 400 }
      );
    }

    // --- 6. Actualizar la autorización en DB ---
    const updated = await db.discountAuthorization.update({
      where: { id: authorizationId },
      data: {
        status: resolution.status,
        approvedDiscount: resolution.approvedDiscount,
        authorizedByUserId: null, // El autorizador fue externo (WA) — sin user ID en el sistema
        responseNote: [
          responseNote,
          authorizedByPhone ? `Autorizador WA: ${authorizedByPhone}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null,
        respondedAt: new Date(),
      },
    });

    // --- 7. Audit log ---
    await logAudit({
      organizationId: orgId,
      actorUserId: "PITAYACORE_AGENT", // Evento externo vía webhook — sin sesión de usuario
      action: `discount_authorization.webhook_${resolution.status.toLowerCase()}`,
      entity: "DiscountAuthorization",
      entityId: updated.id,
      meta: {
        action,
        source: "PITAYACORE_WEBHOOK",
        authorizedByPhone,
        draftSaleId: updated.draftSaleId,
        requestedDiscount: Number(updated.requestedDiscount),
        approvedDiscount: Number(updated.approvedDiscount),
        status: updated.status,
        responseNote,
      },
    });

    console.log(
      `[Webhook] Autorización ${authorizationId} resuelta: ${resolution.status} | Descuento aprobado: $${resolution.approvedDiscount}`
    );

    return NextResponse.json({
      success: true,
      authorizationId: updated.id,
      status: updated.status,
      approvedDiscount: Number(updated.approvedDiscount),
    });
  } catch (error) {
    console.error("[Webhook] Error procesando autorización de descuento:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno del servidor." },
      { status: 500 }
    );
  }
}
