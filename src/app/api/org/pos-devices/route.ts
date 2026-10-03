import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { POSDeviceType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const { organizationId } = access;

    const devices = await db.pOSDevice.findMany({
      where: { organizationId },
      include: {
        site: { select: { id: true, name: true } },
        stripeReaders: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return NextResponse.json({ devices });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/pos-devices] GET error:", error);
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
    const { deviceUuid, deviceName, deviceType, appVersion, siteId } = body;

    if (!deviceUuid || typeof deviceUuid !== "string") {
      return NextResponse.json({ error: "deviceUuid is required." }, { status: 400 });
    }

    const validDeviceType =
      deviceType === "IPHONE_TAP_TO_PAY"
        ? POSDeviceType.IPHONE_TAP_TO_PAY
        : deviceType === "DESKTOP_POS"
        ? POSDeviceType.DESKTOP_POS
        : POSDeviceType.IPAD_POS;

    const device = await db.pOSDevice.upsert({
      where: {
        organizationId_deviceUuid: {
          organizationId,
          deviceUuid: String(deviceUuid).trim(),
        },
      },
      update: {
        deviceName: deviceName ? String(deviceName).trim() : "iPad POS Terminal",
        deviceType: validDeviceType,
        appVersion: appVersion ? String(appVersion).trim() : null,
        siteId: siteId ? String(siteId).trim() : undefined,
        lastSeenAt: new Date(),
        status: "ACTIVE",
      },
      create: {
        organizationId,
        deviceUuid: String(deviceUuid).trim(),
        deviceName: deviceName ? String(deviceName).trim() : "iPad POS Terminal",
        deviceType: validDeviceType,
        appVersion: appVersion ? String(appVersion).trim() : null,
        siteId: siteId ? String(siteId).trim() : null,
        lastSeenAt: new Date(),
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ device });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[org/pos-devices] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
