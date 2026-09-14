import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const suppliers = await db.supplier.findMany({
      where: {
        organizationId: session.activeOrganizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    const supplier = await db.supplier.upsert({
      where: {
        organizationId_name: {
          organizationId: session.activeOrganizationId,
          name: name.trim(),
        },
      },
      update: {
        status: status || "Active",
      },
      create: {
        organizationId: session.activeOrganizationId,
        name: name.trim(),
        status: status || "Active",
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    console.error("Error saving supplier:", error);
    return NextResponse.json(
      { error: "Failed to save supplier" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { id, status, name } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    const supplier = await db.supplier.update({
      where: {
        id,
        organizationId: session.activeOrganizationId,
      },
      data: {
        status,
        name: name ? name.trim() : undefined,
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    console.error("Error updating supplier:", error);
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Supplier ID is required" },
        { status: 400 }
      );
    }

    await db.supplier.delete({
      where: {
        id,
        organizationId: session.activeOrganizationId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return NextResponse.json(
      { error: "Failed to delete supplier" },
      { status: 500 }
    );
  }
}
