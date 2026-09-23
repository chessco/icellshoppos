import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { createChatMessage } from "@/lib/chat-repository";
import { whatsAppGateway } from "@/lib/whatsapp-service";

type SendMessagePayload = {
  channel?: "WHATSAPP" | "INTERNAL";
  phone?: string;
  recipientUserId?: string;
  recipientName?: string;
  content: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as SendMessagePayload;
    const channel = (body.channel || "WHATSAPP").toUpperCase() as "WHATSAPP" | "INTERNAL";
    const content = (body.content || "").trim();

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    if (channel === "WHATSAPP") {
      const rawPhone = body.phone?.replace(/\D/g, "");
      if (!rawPhone || rawPhone.length < 10) {
        return NextResponse.json({ error: "Valid 10+ digit phone number is required" }, { status: 400 });
      }

      const cleanDigits = rawPhone.length === 10 ? `52${rawPhone}` : rawPhone;

      // Send to PitayaCore WhatsApp Gateway with dynamic org settings
      const waResult = await whatsAppGateway.sendMessage(cleanDigits, content, membership.organizationId);

      // Record message in DB
      const record = await createChatMessage({
        organizationId: membership.organizationId,
        channel: "WHATSAPP",
        conversationId: cleanDigits,
        senderId: session.userId,
        senderName: session.email,
        recipientPhone: cleanDigits,
        recipientName: body.recipientName || null,
        content,
        direction: "OUTBOUND",
        status: waResult.success ? "SENT" : "FAILED",
        mediaUrl: waResult.mediaUrl || null,
        providerMessageId: waResult.providerMessageId || null,
      });

      return NextResponse.json({
        success: true,
        message: record,
        providerResult: waResult,
      });
    }

    // INTERNAL Channel
    if (channel === "INTERNAL") {
      if (!body.recipientUserId) {
        return NextResponse.json({ error: "recipientUserId is required for internal messages" }, { status: 400 });
      }

      const roomId = [session.userId, body.recipientUserId].sort().join("_");

      const record = await createChatMessage({
        organizationId: membership.organizationId,
        channel: "INTERNAL",
        conversationId: roomId,
        senderId: session.userId,
        senderName: session.email,
        recipientUserId: body.recipientUserId,
        recipientName: body.recipientName || null,
        content,
        direction: "OUTBOUND",
        status: "SENT",
      });

      return NextResponse.json({
        success: true,
        message: record,
      });
    }

    return NextResponse.json({ error: "Unsupported channel" }, { status: 400 });
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
