import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH: Update a device type
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, description } = await request.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  const updated = await db.deviceType.update({
    where: { id },
    data: { name, description },
  });
  return NextResponse.json({ deviceType: updated });
}

// DELETE: Remove a device type
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await db.deviceType.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
