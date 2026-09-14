import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find organization by slug
    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Check if customer exists
    const customer = await db.customer.findFirst({
      where: {
        organizationId: org.id,
        email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        whatsapp: true,
      },
    });

    if (customer) {
      return NextResponse.json({
        exists: true,
        customer: {
          name: customer.name,
          email: customer.email,
          whatsapp: customer.whatsapp || "",
        },
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error("GET /api/public-customer-check/[slug] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
