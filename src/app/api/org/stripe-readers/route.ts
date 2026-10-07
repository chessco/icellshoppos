import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { getStripeForOrg } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || undefined;
    const locationId = searchParams.get("locationId") || undefined;

    const storedReaders = await db.stripeReader.findMany({
      where: {
        organizationId,
        ...(siteId ? { siteId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      include: {
        posDevice: { select: { id: true, deviceName: true, deviceUuid: true } },
        site: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Stripe is the source of truth for physical reader availability. The
    // local record is still used for the operator's custom name and POS link.
    try {
      const stripeClient = await getStripeForOrg(organizationId);
      const remoteReaders = await stripeClient.terminal.readers.list({
        location: locationId,
        limit: 100,
      });
      const storedByStripeId = new Map(storedReaders.map((reader) => [reader.stripeReaderId, reader]));
      const readers = remoteReaders.data.map((reader) => {
        const stored = storedByStripeId.get(reader.id);
        return {
          id: stored?.id || reader.id,
          stripeReaderId: reader.id,
          label: stored?.label || reader.label || "Stripe Terminal Reader",
          serialNumber: stored?.serialNumber || reader.serial_number || "",
          deviceType: stored?.deviceType || reader.device_type,
          status: reader.status === "online" ? "ONLINE" : "OFFLINE",
          ipAddress: reader.ip_address || null,
          batteryLevel: null,
          stripeLocationId: reader.location || locationId || null,
          lastSeenAt: reader.last_seen_at ? new Date(reader.last_seen_at).toISOString() : null,
        };
      });
      return NextResponse.json({ readers });
    } catch (stripeError) {
      console.warn("[org/stripe-readers] Stripe list unavailable; using local reader records.", stripeError);
    }

    return NextResponse.json({ readers: storedReaders });
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
