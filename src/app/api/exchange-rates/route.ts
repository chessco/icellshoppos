import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const latest = await db.exchangeRate.findFirst({
      where: {
        organizationId: session.activeOrganizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const history = await db.exchangeRate.findMany({
      where: {
        organizationId: session.activeOrganizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    return NextResponse.json({
      latestRate: latest ? latest.usdToMxn.toString() : null,
      history: history.map((rate) => ({
        id: rate.id,
        usdToMxn: rate.usdToMxn.toString(),
        createdAt: rate.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { usdToMxn } = body;

    if (!usdToMxn || isNaN(parseFloat(usdToMxn))) {
      return NextResponse.json(
        { error: "Valid exchange rate is required" },
        { status: 400 }
      );
    }

    const rate = await db.exchangeRate.create({
      data: {
        organizationId: session.activeOrganizationId,
        usdToMxn: parseFloat(usdToMxn),
      },
    });

    return NextResponse.json({ success: true, rate });
  } catch (error) {
    console.error("Error saving exchange rate:", error);
    return NextResponse.json(
      { error: "Failed to save exchange rate" },
      { status: 500 }
    );
  }
}
