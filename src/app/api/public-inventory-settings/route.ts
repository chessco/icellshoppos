import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

const ALLOWED_PUBLIC_COLUMNS = new Set([
  "allowOffers",
  "imei",
  "model",
  "capacity",
  "color",
  "carrier",
  "condition",
  "grade",
  "supplier",
  "site",
  "dateOfPurchase",
  "cost",
  "costCurrency",
  "price",
  "price2",
  "price3",
  "status",
  "batteryHealth",
  "cycleCount",
  "iosVersion",
  "serialNumber",
  "comments",
  "createdAt",
]);

const buildOrgCodeSlug = (organizationId: string) => {
  const compact = organizationId.replace(/-/g, "").toLowerCase();
  return `org-${compact.slice(0, 12)}`;
};

const buildCompanyNameSlug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "users-company-name";

const resolvePlanTier = (code?: string | null, name?: string | null) => {
  const token = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (token.includes("pro")) return "pro";
  if (token.includes("basic")) return "basic";
  return "free";
};

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const organizationId = session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        publicInventoryEnabled: true,
        publicInventoryColumns: true,
        subscriptions: {
          include: {
            plan: {
              select: {
                code: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let columns = ["model", "color", "capacity", "batteryHealth", "price"];
    if (org.publicInventoryColumns) {
      try {
        columns = JSON.parse(org.publicInventoryColumns);
      } catch {
        // fallback to defaults
      }
    }

    const latestSubscription = org.subscriptions[0];
    const planTier = resolvePlanTier(
      latestSubscription?.plan?.code,
      latestSubscription?.plan?.name
    );
    const slugEditable = planTier === "pro";
    const generatedSlug = buildOrgCodeSlug(org.id);
    const suggestedSlugFromName = buildCompanyNameSlug(org.name);

    const effectiveSlug = slugEditable
      ? org.slug
      : org.slug || generatedSlug;

    return NextResponse.json({
      enabled: org.publicInventoryEnabled,
      slug: effectiveSlug,
      columns,
      planTier,
      slugEditable,
      generatedSlug,
      suggestedSlugFromName,
    });
  } catch (error) {
    console.error("GET /api/public-inventory-settings error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (!session.activeOrganizationId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const body = await request.json();
    const { enabled, slug, columns } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid enabled value" }, { status: 400 });
    }

    if (enabled && (!slug || typeof slug !== "string")) {
      return NextResponse.json({ error: "Slug is required when enabled" }, { status: 400 });
    }

    if (!Array.isArray(columns)) {
      return NextResponse.json({ error: "Invalid columns value" }, { status: 400 });
    }

    if (!columns.every((column) => typeof column === "string" && ALLOWED_PUBLIC_COLUMNS.has(column))) {
      return NextResponse.json({ error: "Invalid visible columns configuration" }, { status: 400 });
    }

    const organizationId = session.activeOrganizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const orgWithPlan = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        subscriptions: {
          include: {
            plan: {
              select: {
                code: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!orgWithPlan) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const latestSubscription = orgWithPlan.subscriptions[0];
    const planTier = resolvePlanTier(
      latestSubscription?.plan?.code,
      latestSubscription?.plan?.name
    );
    const slugEditable = planTier === "pro";
    const generatedSlug = buildOrgCodeSlug(orgWithPlan.id);
    const suggestedSlugFromName = buildCompanyNameSlug(orgWithPlan.name);

    const requestedSlug = typeof slug === "string" ? slug : "";
    const finalSlug = slugEditable
      ? requestedSlug
      : generatedSlug;

    // Check if slug is already taken by another org
    if (enabled && finalSlug) {
      const existing = await db.organization.findFirst({
        where: {
          slug: finalSlug,
          id: { not: session.activeOrganizationId },
        },
      });
      if (existing) {
        return NextResponse.json({ error: "This slug is already taken" }, { status: 400 });
      }
    }

    const updated = await db.organization.update({
      where: { id: organizationId },
      data: {
        slug: enabled ? finalSlug : undefined,
        publicInventoryEnabled: enabled,
        publicInventoryColumns: JSON.stringify(columns),
      },
      select: {
        slug: true,
        publicInventoryEnabled: true,
        publicInventoryColumns: true,
      },
    });

    let parsedColumns = columns;
    if (updated.publicInventoryColumns) {
      try {
        parsedColumns = JSON.parse(updated.publicInventoryColumns);
      } catch {
        // fallback
      }
    }

    return NextResponse.json({
      enabled: updated.publicInventoryEnabled,
      slug: updated.slug,
      columns: parsedColumns,
      planTier,
      slugEditable,
      generatedSlug,
      suggestedSlugFromName,
    });
  } catch (error) {
    console.error("POST /api/public-inventory-settings error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
