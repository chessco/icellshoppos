import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { requireSession } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: { name: string; status: "ok" | "fail"; info?: string }[] = [];

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: "database", status: "ok" });
  } catch (e) {
    checks.push({ name: "database", status: "fail", info: (e as Error).message });
  }

  // Email check (optional: only if you want to test sending)
  // try {
  //   await sendEmail({ to: process.env.MAIL_FROM!, subject: "Health Check", text: "Health check" });
  //   checks.push({ name: "email", status: "ok" });
  // } catch (e) {
  //   checks.push({ name: "email", status: "fail", info: (e as Error).message });
  // }

  // Environment check
  const requiredEnv = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "MAILGUN_API_KEY",
    "MAILGUN_DOMAIN",
    "MAIL_FROM",
  ];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      checks.push({ name: `env:${key}`, status: "fail", info: "Missing" });
    } else {
        checks.push({ name: `env:${key}`, status: "ok" });
    }
  }

  // Add more checks as needed

  const allOk = checks.every((c) => c.status === "ok");
  return NextResponse.json({ ok: allOk, checks });
}
