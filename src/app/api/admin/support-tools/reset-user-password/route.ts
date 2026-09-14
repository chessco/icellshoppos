import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/server-auth";

/**
 * POST /api/admin/support-tools/reset-user-password
 * Body: { email: string, newPassword: string }
 * Returns: { success: boolean, message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session.isSuperadmin) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { email, newPassword } = await req.json();
    if (!email || !newPassword) {
      return NextResponse.json({ success: false, message: "Missing email or newPassword." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await logAudit({
      actorUserId: session.userId,
      action: "reset-password",
      entity: "user",
      entityId: user.id,
      meta: { method: "admin", targetEmail: email },
    });

    return NextResponse.json({ success: true, message: "User password has been reset." });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
