import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/server-auth";

const GLOBAL_BRAND_LOGO_ID = "global-logo";
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_STORED_LOGO_BYTES = 350 * 1024;
const MAX_LOGO_DIMENSION = 600;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const ensureSuperadmin = async (request: NextRequest) => {
  const session = await requireSession(request);
  if (!session.isSuperadmin) {
    return null;
  }
  return session;
};

export async function POST(request: NextRequest) {
  try {
    const session = await ensureSuperadmin(request);
    if (!session) {
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

    await db.appBrandAsset.upsert({
      where: { id: GLOBAL_BRAND_LOGO_ID },
      update: {
        data: Uint8Array.from(outputBytes),
        mimeType: "image/webp",
      },
      create: {
        id: GLOBAL_BRAND_LOGO_ID,
        data: Uint8Array.from(outputBytes),
        mimeType: "image/webp",
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
    const session = await ensureSuperadmin(request);
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.appBrandAsset.upsert({
      where: { id: GLOBAL_BRAND_LOGO_ID },
      update: {
        data: null,
        mimeType: null,
      },
      create: {
        id: GLOBAL_BRAND_LOGO_ID,
        data: null,
        mimeType: null,
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
