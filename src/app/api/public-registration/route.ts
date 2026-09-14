import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { normalizeWhatsappFromPayload } from "@/lib/whatsapp";

const REGISTRATION_VERIFICATION_PURPOSE = "public-registration";

const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const resolvePublicOrganizationId = async () => {
  const explicitId = process.env.PUBLIC_ORG_ID?.trim();
  if (explicitId) return explicitId;

  const org = await db.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return org?.id ?? null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, whatsapp, verificationCode, email } = body as {
      name: string;
      whatsapp: string;
      verificationCode: string;
      email: string;
    };

    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const normalizedWhatsapp = normalizeWhatsappFromPayload({
      whatsapp,
      whatsappCountryCode: (body as { whatsappCountryCode?: string })?.whatsappCountryCode,
      whatsappNumber: (body as { whatsappNumber?: string })?.whatsappNumber,
    });

    if (!normalizedWhatsapp) {
      return NextResponse.json(
        { error: "WhatsApp must include a valid country code (+52 or +1) and a 10-digit number" },
        { status: 400 }
      );
    }

    const normalizedCode = String(verificationCode ?? "").trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      return NextResponse.json(
        { error: "A valid 6-digit verification code is required" },
        { status: 400 }
      );
    }

    const latestCode = await db.emailVerificationCode.findFirst({
      where: {
        email: normalizedEmail,
        purpose: REGISTRATION_VERIFICATION_PURPOSE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!latestCode) {
      return NextResponse.json(
        { error: "Verification code not found. Request a new code." },
        { status: 400 }
      );
    }

    if (latestCode.consumedAt) {
      return NextResponse.json(
        { error: "Verification code already used. Request a new code." },
        { status: 400 }
      );
    }

    if (latestCode.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Verification code expired. Request a new code." },
        { status: 400 }
      );
    }

    const incomingHash = hashCode(normalizedCode);
    if (incomingHash !== latestCode.codeHash) {
      return NextResponse.json(
        { error: "Invalid verification code." },
        { status: 400 }
      );
    }

    const organizationId = await resolvePublicOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: "No organization configured for public registration" },
        { status: 500 }
      );
    }

    const orConditions: Array<{ email: string } | { whatsapp: string }> = [
      { email: normalizedEmail },
    ];
    orConditions.push({ whatsapp: normalizedWhatsapp });

    const existingCustomer = await db.customer.findFirst({
      where: {
        organizationId,
        OR: orConditions,
      },
    });

    if (existingCustomer) {
      return NextResponse.json(
        { error: "This email or WhatsApp number is already registered" },
        { status: 400 }
      );
    }

    await db.customer.create({
      data: {
        organizationId,
        name: name.trim(),
        email: normalizedEmail,
        whatsapp: normalizedWhatsapp,
      },
    });

    await db.emailVerificationCode.update({
      where: { id: latestCode.id },
      data: { consumedAt: new Date() },
    });

    return NextResponse.json({ success: true, email: normalizedEmail });
  } catch (error) {
    console.error("Customer registration API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await resolvePublicOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: "No organization configured for public registration" },
        { status: 500 }
      );
    }

    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const customer = await db.customer.findFirst({
      where: { organizationId, email },
    });

    return NextResponse.json({
      registered: !!customer,
      email,
      name: customer?.name ?? "",
      whatsapp: customer?.whatsapp ?? "",
    });
  } catch (error) {
    console.error("Customer check API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
