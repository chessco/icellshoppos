import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const org = await db.organization.findUnique({
      where: { id: access.organizationId },
      select: { useUsdConversion: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ useUsdConversion: org.useUsdConversion });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { useUsdConversion } = body;

    if (typeof useUsdConversion !== "boolean") {
      return NextResponse.json({ error: "useUsdConversion must be a boolean" }, { status: 400 });
    }

    const org = await db.organization.update({
      where: { id: access.organizationId },
      data: { useUsdConversion },
      select: { useUsdConversion: true },
    });

    return NextResponse.json({ useUsdConversion: org.useUsdConversion });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
