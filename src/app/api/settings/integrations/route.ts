import { NextRequest, NextResponse } from "next/server";
import { getActiveMembership, requireSession } from "@/lib/server-auth";
import { db } from "@/lib/db";

const DEFAULT_SETTINGS = {
  whatsapp_provider: "PITAYACORE",
  pitayacore_api_url: process.env.PITAYACORE_API_URL || "https://pitayacore-api.pitayacode.io/api",
  pitayacore_api_key: process.env.PITAYACORE_API_KEY || "",
  pitayacore_tenant_id: process.env.PITAYACORE_TENANT_ID || "",
  pitayacore_agent_slug: "icellshop-autorizaciones",
  pitayacore_authorizer_phone: "",
  pitayacore_webhook_secret: "",
  flow_api_url: process.env.FLOW_API_URL || "https://flow-api.pitayacode.io",
  flow_internal_key: process.env.FLOW_INTERNAL_KEY || "",
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = membership.organizationId;
    const prefix = `integration:${orgId}:`;

    // Fetch settings for this organization
    const settingsRows = await db.systemSetting.findMany({
      where: {
        key: { startsWith: prefix },
      },
    });

    const result: Record<string, string> = { ...DEFAULT_SETTINGS };

    for (const row of settingsRows) {
      const fieldKey = row.key.replace(prefix, "");
      result[fieldKey] = row.value;
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const orgId = membership.organizationId;
    const prefix = `integration:${orgId}:`;

    const allowedKeys = [
      "whatsapp_provider",
      "pitayacore_api_url",
      "pitayacore_api_key",
      "pitayacore_tenant_id",
      "pitayacore_agent_slug",
      "pitayacore_authorizer_phone",
      "pitayacore_webhook_secret",
      "flow_api_url",
      "flow_internal_key",
    ];

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const fullKey = `${prefix}${key}`;
        await db.systemSetting.upsert({
          where: { key: fullKey },
          update: { value: String(body[key] ?? "") },
          create: { key: fullKey, value: String(body[key] ?? "") },
        });
      }
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
