/**
 * pitayacore-agent.ts
 *
 * Helper para enviar solicitudes de autorización de descuentos al autorizador por WhatsApp
 * via PitayaCore y para registrar el contexto de la sesión del agente.
 *
 * Flujo:
 *   1. Pro Buyer envía mensaje WA al autorizador con el resumen de la solicitud.
 *   2. El autorizador responde en WA → PitayaCore (agente icellshop-autorizaciones) interpreta.
 *   3. PitayaCore llama POST /api/sales/authorizations/webhook con la decisión estructurada.
 */

import { whatsAppGateway } from "@/lib/whatsapp-service";
import type { AuthorizationSnapshot } from "@/lib/discount-authorization";

export type AgentTriggerResult = {
  success: boolean;
  messageId?: string | null;
  webFallbackUrl?: string | null;
  error?: string;
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildAuthorizationMessage(params: {
  authorizationId: string;
  snapshot: AuthorizationSnapshot;
  webhookBaseUrl: string;
}): string {
  const { authorizationId, snapshot } = params;
  const { customer, seller, items, financials } = snapshot;

  const itemLines = items
    .map((item, i) => {
      const parts: string[] = [`${i + 1}. ${item.model}`];
      if (item.capacity) parts[0] += ` ${item.capacity}`;
      if (item.color) parts[0] += ` ${item.color}`;
      if (item.imei) parts.push(`   IMEI: ${item.imei}`);
      if (item.batteryHealth) parts.push(`   Batería: ${item.batteryHealth}`);
      parts.push(`   Precio: ${formatCurrency(item.salePrice)}`);
      return parts.join("\n");
    })
    .join("\n");

  const marginAfter = financials.marginAfterRequestedDiscount;
  const marginPctAfter = financials.marginPercentageAfterRequestedDiscount;
  const marginBefore = financials.marginBeforeDiscount;
  const marginPctBefore = financials.marginPercentageBeforeDiscount;

  const lines = [
    `🔐 *SOLICITUD DE AUTORIZACIÓN DE DESCUENTO*`,
    `ID: ${authorizationId.slice(0, 8).toUpperCase()}`,
    ``,
    `👤 *Cliente:* ${customer.name}`,
    `🧑‍💼 *Vendedor:* ${seller.name}`,
    ``,
    `📱 *Equipo(s):*`,
    itemLines,
    ``,
    `💰 *Resumen Financiero:*`,
    `• Precio total: ${formatCurrency(financials.originalPrice)}`,
    `• Margen actual: ${formatCurrency(marginBefore)} (${marginPctBefore}%)`,
    `• Descuento solicitado: ${formatCurrency(financials.requestedDiscount)}`,
    `• Precio final: ${formatCurrency(financials.priceAfterRequestedDiscount)}`,
    `• Margen después del descuento: ${formatCurrency(marginAfter)} (${marginPctAfter}%)`,
    ``,
    `✅ *Para APROBAR:* Responde "Sí", "Autorizado", o "Aprueba $${financials.requestedDiscount}"`,
    `💛 *Para APROBAR PARCIAL:* Responde "Autorizo $300" (el monto que autorizas)`,
    `❌ *Para RECHAZAR:* Responde "No" o "Rechazado"`,
  ];

  return lines.join("\n");
}

/**
 * Envía la notificación de solicitud de autorización de descuento al autorizador por WhatsApp.
 * Usa el WhatsAppGateway existente (PitayaCore) para enviar el mensaje.
 *
 * El agente icellshop-autorizaciones en PitayaCore:
 *   - Recibe la respuesta del autorizador en WhatsApp
 *   - Interpreta la respuesta en lenguaje natural
 *   - Llama POST /api/sales/authorizations/webhook con la decisión estructurada
 */
export async function notifyAuthorizerViaWhatsApp(params: {
  authorizationId: string;
  organizationId: string;
  authorizerPhone: string;
  snapshot: AuthorizationSnapshot;
  webhookBaseUrl?: string;
}): Promise<AgentTriggerResult> {
  const { authorizationId, organizationId, authorizerPhone, snapshot } = params;
  const webhookBaseUrl = params.webhookBaseUrl || "";

  if (!authorizerPhone) {
    return {
      success: false,
      error: "No hay número de WhatsApp configurado para el autorizador.",
    };
  }

  const message = buildAuthorizationMessage({
    authorizationId,
    snapshot,
    webhookBaseUrl,
  });

  try {
    const result = await whatsAppGateway.sendMessage(authorizerPhone, message, organizationId);

    // Registrar en el historial de mensajes de iCellShop para que aparezca en /messages
    try {
      const { createChatMessage } = await import("@/lib/chat-repository");
      const cleanPhone = authorizerPhone.replace(/\D/g, "");
      await createChatMessage({
        organizationId,
        channel: "WHATSAPP",
        conversationId: cleanPhone,
        senderName: snapshot.seller.name || "Sistema POS",
        recipientPhone: cleanPhone,
        recipientName: "Autorizador",
        content: message,
        direction: "OUTBOUND",
        status: result.success ? "SENT" : "FAILED",
        providerMessageId: result.providerMessageId || null,
      });
    } catch (chatErr) {
      console.warn("[PitayaCore Agent] No se pudo registrar ChatMessage:", chatErr);
    }

    return {
      success: result.success,
      messageId: result.providerMessageId,
      webFallbackUrl: result.webFallbackUrl,
      error: result.error,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Error al enviar notificación WhatsApp al autorizador.",
    };
  }
}
