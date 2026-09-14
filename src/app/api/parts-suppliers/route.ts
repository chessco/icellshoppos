import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

const normalizeName = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs && !permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const suppliers = await db.partsSupplier.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = normalizeName(body.name);
    const status = normalizeName(body.status) || "Active";

    if (!name) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    const supplier = await db.partsSupplier.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name,
        },
      },
      update: {
        status,
      },
      create: {
        organizationId,
        name,
        status,
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    const name = normalizeName(body.name);
    const status = normalizeName(body.status);

    if (!id) {
      return NextResponse.json({ error: "Supplier ID is required" }, { status: 400 });
    }

    const existing = await db.partsSupplier.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const supplier = await db.partsSupplier.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(status ? { status } : {}),
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "Supplier ID is required" }, { status: 400 });
    }

    const existing = await db.partsSupplier.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    await db.partsSupplier.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
