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

    const failures = await db.repairTypicalFailure.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ failures });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs && !permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = normalizeName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const failure = await db.repairTypicalFailure.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: { status: "Active", updatedAt: new Date() },
      create: { organizationId, name, status: "Active" },
    });

    return NextResponse.json({ failure }, { status: 201 });
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
    const id = normalizeName(body.id);
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const existing = await db.repairTypicalFailure.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string") data.name = normalizeName(body.name);
    if (typeof body.status === "string") data.status = normalizeName(body.status);

    const failure = await db.repairTypicalFailure.update({ where: { id }, data });
    return NextResponse.json({ failure });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = normalizeName(body.id);
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const existing = await db.repairTypicalFailure.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.repairTypicalFailure.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
