import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

type CustomerPayload = {
  id?: string;
  name: string;
  email?: string;
  whatsapp?: string;
  customerType?: string;
  defaultPriceTier?: string;
  status?: string;
  creditEnabled?: boolean;
};

const normalizeCustomerType = (value: unknown): "retail" | "wholesale" => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "wholesale" ? "wholesale" : "retail";
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const customers = await db.customer.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ customers });
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

    const body = (await request.json()) as CustomerPayload;
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!body?.email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!body?.whatsapp?.trim()) {
      return NextResponse.json({ error: "WhatsApp is required" }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        organizationId: membership.organizationId,
        name: body.name.trim(),
        email: body.email.trim(),
        whatsapp: body.whatsapp.trim(),
        customerType: normalizeCustomerType(body.customerType),
        defaultPriceTier: body.defaultPriceTier?.trim() || "Price",
        status: body.status?.trim() || "Active",
      },
    });

    return NextResponse.json({ customer });
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

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as CustomerPayload;
    if (!body?.id?.trim()) {
      return NextResponse.json({ error: "Customer id is required" }, { status: 400 });
    }

    // Only admins/superadmins can change creditEnabled
    const updateData: Record<string, unknown> = {
      name: body.name?.trim(),
      email: body.email?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      defaultPriceTier: body.defaultPriceTier?.trim() || undefined,
      status: body.status?.trim() || undefined,
    };

    if (typeof body.customerType !== "undefined") {
      updateData.customerType = normalizeCustomerType(body.customerType);
    }

    if (typeof body.creditEnabled === "boolean") {
      const canManageCredit = session.isSuperadmin || membership.role === "admin" || membership.role === "superadmin";
      if (!canManageCredit) {
        return NextResponse.json({ error: "Only admins can change customer credit settings." }, { status: 403 });
      }
      updateData.creditEnabled = body.creditEnabled;
    }

    const existingCustomer = await db.customer.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!existingCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const customer = await db.customer.update({
      where: { id: body.id },
      data: updateData,
    });

    return NextResponse.json({ customer });
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const membership = getActiveMembership(session);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { id: string };
    if (!body?.id?.trim()) {
      return NextResponse.json({ error: "Customer id is required" }, { status: 400 });
    }

    const deleted = await db.customer.deleteMany({
      where: { id: body.id, organizationId: membership.organizationId },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
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
