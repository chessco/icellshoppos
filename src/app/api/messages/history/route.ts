import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { getChatMessages } from "@/lib/chat-repository";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId") || searchParams.get("phone");
    const channel = (searchParams.get("channel") || "WHATSAPP").toUpperCase() as "WHATSAPP" | "INTERNAL";

    if (!conversationId) {
      return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const cleanConversationId = channel === "WHATSAPP" ? conversationId.replace(/\D/g, "") : conversationId;
    const messages = await getChatMessages(membership.organizationId, channel, cleanConversationId);

    return NextResponse.json({ messages });
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
