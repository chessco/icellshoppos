import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import sharp from "sharp";

const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_STORED_LOGO_BYTES = 350 * 1024;
const MAX_LOGO_DIMENSION = 600;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);

    const org = await db.organization.findUnique({
      where: { id: access.organizationId },
      select: { logoData: true, logoMimeType: true },
    });

    if (!org?.logoData || !org.logoMimeType) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }

    return new NextResponse(org.logoData, {
      status: 200,
      headers: {
        "Content-Type": org.logoMimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Logo file is required" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPEG, or WEBP images are allowed" }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "Logo must be between 1 byte and 1MB" }, { status: 400 });
    }

    const inputBytes = Buffer.from(await file.arrayBuffer());
    let outputBytes = await sharp(inputBytes)
      .rotate()
      .resize(MAX_LOGO_DIMENSION, MAX_LOGO_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    if (outputBytes.length > MAX_STORED_LOGO_BYTES) {
      outputBytes = await sharp(inputBytes)
        .rotate()
        .resize(MAX_LOGO_DIMENSION, MAX_LOGO_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 68 })
        .toBuffer();
    }

    if (outputBytes.length > MAX_STORED_LOGO_BYTES) {
      return NextResponse.json(
        { error: "Logo is too large after optimization. Please use a simpler image." },
        { status: 400 }
      );
    }

    await db.organization.update({
      where: { id: access.organizationId },
      data: {
        logoData: Uint8Array.from(outputBytes),
        logoMimeType: "image/webp",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    if (!access.permissions.canManageOrgSettings) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.organization.update({
      where: { id: access.organizationId },
      data: {
        logoData: null,
        logoMimeType: null,
      },
    });

    return NextResponse.json({ success: true });
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