import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultCarrierOptions, normalizeCarrierOptions } from "@/lib/carrier-options";

type OrgCarrierOptionsRecord = {
  carrierOptionsJson: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const organization = await (db.organization as unknown as {
      findUnique: (args: unknown) => Promise<OrgCarrierOptionsRecord | null>;
    }).findUnique({
      where: { id: access.organizationId },
      select: { carrierOptionsJson: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      options: normalizeCarrierOptions(organization.carrierOptionsJson),
      defaults: defaultCarrierOptions,
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
    const options = normalizeCarrierOptions((body as { options?: unknown }).options);

    const organization = await (db.organization as unknown as {
      update: (args: unknown) => Promise<OrgCarrierOptionsRecord>;
    }).update({
      where: { id: access.organizationId },
      data: { carrierOptionsJson: options as unknown as object },
      select: { carrierOptionsJson: true },
    });

    return NextResponse.json({ options: normalizeCarrierOptions(organization.carrierOptionsJson) });
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
