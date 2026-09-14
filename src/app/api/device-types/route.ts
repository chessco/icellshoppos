import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: List all device types
export async function GET() {
  const types = await db.deviceType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ deviceTypes: types });
}

// POST: Create a new device type
export async function POST(request: NextRequest) {
  const { name, description } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const type = await db.deviceType.create({ data: { name, description } });
  return NextResponse.json({ deviceType: type });
}
