import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const org = await db.organization.findUnique({
      where: { id: access.organizationId },
      select: { labelTemplateJson: true },
    });

    return NextResponse.json({ template: org?.labelTemplateJson ?? null });
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

export async function PUT(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canEditLabelTemplate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const template = (body as { template?: unknown }).template;

    if (!template || typeof template !== "object") {
      return NextResponse.json({ error: "Template is required." }, { status: 400 });
    }

    await db.organization.update({
      where: { id: access.organizationId },
      data: { labelTemplateJson: template as object },
    });

    return NextResponse.json({ success: true });
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
