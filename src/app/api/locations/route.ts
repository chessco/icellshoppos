import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestSession } from "@/lib/server-auth";

async function ensureMainLocation(organizationId: string) {
  await db.site.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: "Main",
      },
    },
    update: {
      status: "Active",
    },
    create: {
      organizationId,
      name: "Main",
      status: "Active",
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    await ensureMainLocation(session.activeOrganizationId);

    const locations = await db.site.findMany({
      where: { organizationId: session.activeOrganizationId },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json({ locations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Location name is required" }, { status: 400 });
    }

    const location = await db.site.upsert({
      where: {
        organizationId_name: {
          organizationId: session.activeOrganizationId,
          name,
        },
      },
      update: {
        status: "Active",
      },
      create: {
        organizationId: session.activeOrganizationId,
        name,
        status: "Active",
      },
    });

    return NextResponse.json({ success: true, location });
  } catch (error) {
    console.error("Error saving location:", error);
    return NextResponse.json({ error: "Failed to save location" }, { status: 500 });
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
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const status = typeof body?.status === "string" ? body.status : undefined;

    if (!id) {
      return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
    }

    const existing = await db.site.findFirst({
      where: {
        id,
        organizationId: session.activeOrganizationId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    if (existing.name === "Main" && status && status !== "Active") {
      return NextResponse.json({ error: "Main location must stay Active" }, { status: 400 });
    }

    if (existing.name === "Main" && name && name !== "Main") {
      return NextResponse.json({ error: "Main location cannot be renamed" }, { status: 400 });
    }

    const location = await db.site.update({
      where: { id },
      data: {
        name,
        status,
      },
    });

    return NextResponse.json({ success: true, location });
  } catch (error) {
    console.error("Error updating location:", error);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
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
    const id = typeof body?.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
    }

    const existing = await db.site.findFirst({
      where: {
        id,
        organizationId: session.activeOrganizationId,
      },
      include: {
        _count: {
          select: { inventoryItems: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    if (existing.name === "Main") {
      return NextResponse.json({ error: "Main location cannot be deleted" }, { status: 400 });
    }

    if (existing._count.inventoryItems > 0) {
      return NextResponse.json(
        { error: "Cannot delete a location with inventory assigned" },
        { status: 400 }
      );
    }

    await db.site.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting location:", error);
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 });
  }
}
