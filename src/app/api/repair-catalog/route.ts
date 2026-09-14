import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export type RepairCatalog = {
  brands: Array<{ name: string; models: string[] }>;
  colors: string[];
};

const DEFAULT_CATALOG: RepairCatalog = { brands: [], colors: [] };

export async function GET(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs && !permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { repairCatalogJson: true },
    });

    const catalog = (org?.repairCatalogJson as RepairCatalog | null) ?? DEFAULT_CATALOG;
    return NextResponse.json({ catalog });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const catalog = body.catalog as RepairCatalog | undefined;
    if (!catalog || typeof catalog !== "object") {
      return NextResponse.json({ error: "Invalid catalog payload" }, { status: 400 });
    }

    await db.organization.update({
      where: { id: organizationId },
      data: { repairCatalogJson: catalog },
    });

    return NextResponse.json({ catalog });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
