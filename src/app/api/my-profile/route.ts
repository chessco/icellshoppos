import { NextResponse } from "next/server";

const message =
  "This endpoint was retired because Google OAuth/Sheets integration has been removed. Use database-backed APIs instead.";

export async function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ error: message }, { status: 410 });
}
