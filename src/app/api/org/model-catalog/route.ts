import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { defaultModelCatalog, normalizeModelCatalog } from "@/lib/modelCatalog";

type OrgModelCatalogRecord = {
  modelCatalogJson: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const organization = await (db.organization as unknown as {
      findUnique: (args: unknown) => Promise<OrgModelCatalogRecord | null>;
    }).findUnique({
      where: { id: access.organizationId },
      select: { modelCatalogJson: true },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      catalog: normalizeModelCatalog(organization.modelCatalogJson),
      defaults: defaultModelCatalog,
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
    const catalog = normalizeModelCatalog((body as { catalog?: unknown }).catalog);

    const organization = await (db.organization as unknown as {
      update: (args: unknown) => Promise<OrgModelCatalogRecord>;
    }).update({
      where: { id: access.organizationId },
      data: { modelCatalogJson: catalog as unknown as object },
      select: { modelCatalogJson: true },
    });

    return NextResponse.json({ catalog: normalizeModelCatalog(organization.modelCatalogJson) });
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
