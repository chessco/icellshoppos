import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

const norm = (value: unknown) => String(value ?? "").trim();

export async function GET(request: NextRequest) {
  try {
    const { organizationId, permissions } = await getRequestOrgAccess(request);
    if (!permissions.canManageRepairs && !permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const customers = await db.repairCustomer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ customers });
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
    const name = norm(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const customer = await db.repairCustomer.create({
      data: {
        organizationId,
        name,
        whatsapp: norm(body.whatsapp) || null,
        email: norm(body.email) || null,
        notes: norm(body.notes) || null,
        status: "Active",
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
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
    if (!permissions.canManageRepairs && !permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = norm(body.id);
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const existing = await db.repairCustomer.findFirst({ where: { id, organizationId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string") data.name = norm(body.name);
    if (typeof body.whatsapp === "string") data.whatsapp = norm(body.whatsapp) || null;
    if (typeof body.email === "string") data.email = norm(body.email) || null;
    if (typeof body.notes === "string") data.notes = norm(body.notes) || null;
    if (typeof body.status === "string") data.status = norm(body.status);

    const customer = await db.repairCustomer.update({ where: { id }, data });
    return NextResponse.json({ customer });
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
    const id = norm(body.id);
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const existing = await db.repairCustomer.findFirst({ where: { id, organizationId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.repairCustomer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")) {
      return NextResponse.json({ error: error.message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: error.message === "UNAUTHORIZED" ? 401 : 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
