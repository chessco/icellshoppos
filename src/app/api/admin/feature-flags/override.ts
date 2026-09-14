import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!session.isSuperadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { flagId, orgId, enabled } = await request.json();
    if (!flagId || !orgId) return NextResponse.json({ error: "Missing flagId or orgId" }, { status: 400 });
    return NextResponse.json(
      {
        error: "Feature flag overrides are not configured in the current database schema.",
        details: { flagId, orgId, enabled },
      },
      { status: 501 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
