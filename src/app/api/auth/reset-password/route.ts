import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/auth/reset-password
 * Body: { token: string, password: string }
 * Returns: { success: boolean, message: string }
 */
export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) {
    return NextResponse.json({ success: false, message: "Missing token or password." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ success: false, message: "Password must be at least 8 characters." }, { status: 400 });
  }

  const codeHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const code = await prisma.emailVerificationCode.findFirst({
    where: {
      codeHash,
      purpose: "password_reset",
      expiresAt: { gt: now },
      consumedAt: null,
    },
    include: { user: true },
  });

  if (!code || !code.user) {
    return NextResponse.json({ success: false, message: "Invalid or expired reset token." }, { status: 400 });
  }

  // Update user password
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: code.user.id },
    data: { passwordHash },
  });
  await logAudit({
    actorUserId: code.user.id,
    action: "reset-password",
    entity: "user",
    entityId: code.user.id,
    meta: { method: "self-service" },
  });

  // Mark code as consumed
  await prisma.emailVerificationCode.update({
    where: { id: code.id },
    data: { consumedAt: now },
  });

  return NextResponse.json({ success: true, message: "Password reset successful." });
}
