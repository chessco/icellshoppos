import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultGradeOptions } from "@/lib/sheets";

type OrgGradeOptionsRecord = {
  gradeOptionsJson: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const organization = await (db.organization as unknown as {
      findUnique: (args: unknown) => Promise<OrgGradeOptionsRecord | null>;
    }).findUnique({
      where: { id: access.organizationId },
      select: { gradeOptionsJson: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    return NextResponse.json({
      options: Array.isArray(organization.gradeOptionsJson) && organization.gradeOptionsJson.length > 0
        ? organization.gradeOptionsJson
        : defaultGradeOptions,
      defaults: defaultGradeOptions,
    });
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
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const options = Array.isArray(body.options)
      ? body.options.map((g: unknown) => String(g).trim()).filter(Boolean).slice(0, 10)
      : defaultGradeOptions;
    const organization = await (db.organization as unknown as {
      update: (args: unknown) => Promise<OrgGradeOptionsRecord>;
    }).update({
      where: { id: access.organizationId },
      data: { gradeOptionsJson: options as unknown as object },
      select: { gradeOptionsJson: true },
    });
    return NextResponse.json({ options: organization.gradeOptionsJson });
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
