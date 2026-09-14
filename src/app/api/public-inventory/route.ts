import { NextResponse } from "next/server";

const message =
  "This endpoint was retired because Google OAuth/Sheets integration has been removed. Use slug-based public inventory endpoints instead.";

export async function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}
