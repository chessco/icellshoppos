// API route stub for payment history

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, getActiveMembership } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const organizationId = membership.organizationId;
    const payments = await db.payment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ payments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
