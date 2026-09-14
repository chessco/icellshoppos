import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";

const formatRule = (rule: {
  id: string;
  model: string;
  capacity: string;
  price: unknown;
  price2: unknown;
  price3: unknown;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: rule.id,
  model: rule.model,
  capacity: rule.capacity,
  price: rule.price?.toString?.() ?? "",
  price2: rule.price2?.toString?.() ?? "",
  price3: rule.price3?.toString?.() ?? "",
  createdAt: rule.createdAt.toISOString(),
  updatedAt: rule.updatedAt.toISOString(),
});

const parseDecimalRequired = (value: string | null | undefined) => {
  if (!value || !value.trim()) return 0;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function GET(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rules = await db.priceRule.findMany({
      where: { organizationId: access.organizationId },
      orderBy: [{ model: "asc" }, { capacity: "asc" }],
    });

    return NextResponse.json({ rules: rules.map(formatRule) });
  } catch (error) {
    console.error("Error fetching pricing rules:", error);
    return NextResponse.json({ error: "Failed to fetch pricing rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!access.permissions.canEditPricingRules) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const model = String(body.model || "").trim();
    const capacity = String(body.capacity || "").trim();

    if (!model || !capacity) {
      return NextResponse.json({ error: "Model and capacity are required" }, { status: 400 });
    }

    const rule = await db.priceRule.upsert({
      where: {
        organizationId_model_capacity: {
          organizationId: access.organizationId,
          model,
          capacity,
        },
      },
      update: {
        price: parseDecimalRequired(body.price),
        price2: parseDecimalRequired(body.price2),
        price3: parseDecimalRequired(body.price3),
      },
      create: {
        organizationId: access.organizationId,
        model,
        capacity,
        price: parseDecimalRequired(body.price),
        price2: parseDecimalRequired(body.price2),
        price3: parseDecimalRequired(body.price3),
      },
    });

    return NextResponse.json({ rule: formatRule(rule) });
  } catch (error) {
    console.error("Error saving pricing rule:", error);
    return NextResponse.json({ error: "Failed to save pricing rule" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!access.permissions.canEditPricingRules) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Pricing rule id is required" }, { status: 400 });
    }

    await db.priceRule.delete({
      where: {
        id,
        organizationId: access.organizationId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pricing rule:", error);
    return NextResponse.json({ error: "Failed to delete pricing rule" }, { status: 500 });
  }
}
