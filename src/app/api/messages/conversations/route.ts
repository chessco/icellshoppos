import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { getWhatsAppConversations, getInternalConversations } from "@/lib/chat-repository";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "whatsapp";

    if (tab === "internal") {
      const conversations = await getInternalConversations(membership.organizationId, session.userId);
      return NextResponse.json({ conversations });
    }

    const userOrgIds = Array.from(
      new Set([
        membership.organizationId,
        ...session.memberships.map((m) => m.organizationId),
        ...(session.activeOrganizationId ? [session.activeOrganizationId] : []),
      ])
    );

    const conversations = await getWhatsAppConversations(userOrgIds);
    return NextResponse.json({ conversations });
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
