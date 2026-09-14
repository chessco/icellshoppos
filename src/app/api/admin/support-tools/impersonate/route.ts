import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";

/**
 * POST /api/admin/support-tools/impersonate
 * Body: { userId: string }
 * Returns: { success: boolean, message: string, impersonationToken?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session.isSuperadmin) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ success: false, message: "Missing userId" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!targetUser) {
      await logAudit({ actorUserId: session.userId, action: "impersonate.attempt", entity: "User", entityId: userId, meta: { outcome: "user_not_found" } });
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    // Full impersonation session minting is not yet implemented.
    // Log the attempt and return a controlled not-available response to prevent misuse of placeholder tokens.
    await logAudit({ actorUserId: session.userId, action: "impersonate.attempt", entity: "User", entityId: targetUser.id, meta: { targetEmail: targetUser.email, outcome: "not_implemented" } });

    return NextResponse.json(
      { success: false, message: "Impersonation session creation is not yet available. Attempt has been logged." },
      { status: 501 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
