import { NextResponse } from "next/server";

const message =
  "This endpoint was retired because Google OAuth/Sheets integration has been removed. Use database-backed APIs instead.";

export async function POST() {
  return NextResponse.json({ error: message }, { status: 410 });
}
