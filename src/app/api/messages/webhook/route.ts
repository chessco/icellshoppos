import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canonicalWhatsAppPhone, createChatMessage } from "@/lib/chat-repository";

export async function POST(request: NextRequest) {
  try {
    const rawSecret =
      request.headers.get("x-pitayacore-secret") ||
      request.headers.get("x-api-key") ||
      "";

    // Validar secret contra la configuración de la organización
    const secretSetting = await db.systemSetting.findFirst({
      where: {
        OR: [
          { key: "pitayacore_webhook_secret" },
          { key: { endsWith: "pitayacore_webhook_secret" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
    const expectedSecret =
      secretSetting?.value ||
      process.env.PITAYACORE_WEBHOOK_SECRET ||
      "";

    if (!expectedSecret || (rawSecret && rawSecret !== expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized: Invalid secret" }, { status: 401 });
    }

    const body = await request.json();
    const { from, content, senderName } = body;

    if (!from || !content) {
      return NextResponse.json(
        { error: "Campos 'from' y 'content' son requeridos" },
        { status: 400 }
      );
    }

    // Normalizar teléfono canónico
    const cleanPhone = canonicalWhatsAppPhone(from);

    // Obtener la organización por defecto o primera activa
    const defaultOrg = await db.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!defaultOrg) {
      return NextResponse.json({ error: "No organization found" }, { status: 500 });
    }

    // Guardar mensaje entrante
    const savedMsg = await createChatMessage({
      organizationId: defaultOrg.id,
      channel: "WHATSAPP",
      conversationId: cleanPhone,
      senderName: senderName || "Cliente",
      direction: "INBOUND",
      content: content.trim(),
      status: "DELIVERED",
    });

    return NextResponse.json({
      success: true,
      messageId: savedMsg.id,
      cleanPhone,
    });
  } catch (error: any) {
    console.error("[MessagesWebhook] Error processing incoming WhatsApp message:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
