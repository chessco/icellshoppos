import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || undefined;

    const readers = await db.stripeReader.findMany({
      where: {
        organizationId,
        ...(siteId ? { siteId } : {}),
      },
      include: {
        posDevice: { select: { id: true, deviceName: true, deviceUuid: true } },
        site: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ readers });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/stripe-readers] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;

    const body = await request.json().catch(() => ({}));
    const {
      stripeReaderId,
      label,
      serialNumber,
      deviceType,
      connectionType = "BLUETOOTH",
      ipAddress,
      locationId,
      posDeviceId,
      siteId,
    } = body;

    if (!stripeReaderId || typeof stripeReaderId !== "string") {
      return NextResponse.json({ error: "stripeReaderId is required." }, { status: 400 });
    }

    const reader = await db.stripeReader.upsert({
      where: {
        organizationId_stripeReaderId: {
          organizationId,
          stripeReaderId: String(stripeReaderId).trim(),
        },
      },
      update: {
        label: label ? String(label).trim() : "Stripe Terminal Reader",
        serialNumber: serialNumber ? String(serialNumber).trim() : undefined,
        deviceType: deviceType ? String(deviceType).trim() : undefined,
        connectionType: connectionType === "IP" ? "IP" : "BLUETOOTH",
        ipAddress: ipAddress ? String(ipAddress).trim() : null,
        locationId: locationId ? String(locationId).trim() : undefined,
        posDeviceId: posDeviceId ? String(posDeviceId).trim() : undefined,
        siteId: siteId ? String(siteId).trim() : undefined,
        status: "ONLINE",
      },
      create: {
        organizationId,
        stripeReaderId: String(stripeReaderId).trim(),
        label: label ? String(label).trim() : "Stripe Terminal Reader",
        serialNumber: serialNumber ? String(serialNumber).trim() : null,
        deviceType: deviceType ? String(deviceType).trim() : "BBPOS_WISEPAD_3",
        connectionType: connectionType === "IP" ? "IP" : "BLUETOOTH",
        ipAddress: ipAddress ? String(ipAddress).trim() : null,
        locationId: locationId ? String(locationId).trim() : null,
        posDeviceId: posDeviceId ? String(posDeviceId).trim() : null,
        siteId: siteId ? String(siteId).trim() : null,
        status: "ONLINE",
      },
    });

    return NextResponse.json({ reader });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/stripe-readers] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
