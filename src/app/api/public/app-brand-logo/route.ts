import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const GLOBAL_BRAND_LOGO_ID = "global-logo";

const fallbackSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48" role="img" aria-label="Pro Buyer">
  <rect width="240" height="48" fill="transparent"/>
  <text x="0" y="31" fill="#0f1f3d" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700">Pro Buyer</text>
</svg>
`.trim();

export async function GET() {
  try {
    const logo = await db.appBrandAsset.findUnique({
      where: { id: GLOBAL_BRAND_LOGO_ID },
      select: { data: true, mimeType: true },
    });

    if (logo?.data && logo.mimeType) {
      return new NextResponse(logo.data, {
        status: 200,
        headers: {
          "Content-Type": logo.mimeType,
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    return new NextResponse(fallbackSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(fallbackSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=120",
      },
    });
  }
}
