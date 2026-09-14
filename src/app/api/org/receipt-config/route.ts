import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig } from "@/lib/receipt-config";

type OrgReceiptConfigRecord = {
  receiptConfigJson: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const org = await (db.organization as unknown as {
      findUnique: (args: unknown) => Promise<OrgReceiptConfigRecord | null>;
    }).findUnique({
      where: { id: access.organizationId },
      select: { receiptConfigJson: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const config = normalizeReceiptConfig(org.receiptConfigJson);
    return NextResponse.json({ config, defaults: DEFAULT_RECEIPT_CONFIG });
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
    const incomingConfig = (body as { config?: unknown }).config;
    const config = normalizeReceiptConfig(incomingConfig);

    const org = await (db.organization as unknown as {
      update: (args: unknown) => Promise<OrgReceiptConfigRecord>;
    }).update({
      where: { id: access.organizationId },
      data: { receiptConfigJson: config as unknown as object },
      select: { receiptConfigJson: true },
    });

    return NextResponse.json({ config: normalizeReceiptConfig(org.receiptConfigJson) });
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
