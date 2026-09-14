import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultConditionOptions } from "@/lib/sheets";

type OrgConditionOptionsRecord = {
  conditionOptionsJson: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const organization = await (db.organization as unknown as {
      findUnique: (args: unknown) => Promise<OrgConditionOptionsRecord | null>;
    }).findUnique({
      where: { id: access.organizationId },
      select: { conditionOptionsJson: true },
    });
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    return NextResponse.json({
      options: Array.isArray(organization.conditionOptionsJson) && organization.conditionOptionsJson.length > 0
        ? organization.conditionOptionsJson
        : defaultConditionOptions,
      defaults: defaultConditionOptions,
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
      ? body.options.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 10)
      : defaultConditionOptions;
    const organization = await (db.organization as unknown as {
      update: (args: unknown) => Promise<OrgConditionOptionsRecord>;
    }).update({
      where: { id: access.organizationId },
      data: { conditionOptionsJson: options as unknown as object },
      select: { conditionOptionsJson: true },
    });
    return NextResponse.json({ options: organization.conditionOptionsJson });
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
