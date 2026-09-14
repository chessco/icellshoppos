import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSubscriptionActive } from "@/lib/subscription";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        status: true,
        publicInventoryEnabled: true,
        logoData: true,
        logoMimeType: true,
        subscriptions: {
          select: { status: true, trialEndsAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (org.status === "archived" || !org.publicInventoryEnabled) {
      return NextResponse.json({ error: "Public logo not available" }, { status: 403 });
    }
    if (!isSubscriptionActive(org.subscriptions[0] ?? null)) {
      return NextResponse.json({ error: "Public logo not available" }, { status: 403 });
    }
    if (!org.logoData || !org.logoMimeType) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }

    return new NextResponse(org.logoData, {
      status: 200,
      headers: {
        "Content-Type": org.logoMimeType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}