import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/server-auth";

const message = "Feature flags are not configured in the current database schema.";

const requireSuperadmin = async (request: NextRequest) => {
  const session = await requireSession(request);
  if (!session.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
};

export async function GET(request: NextRequest) {
  try {
    const forbiddenResponse = await requireSuperadmin(request);
    if (forbiddenResponse) return forbiddenResponse;

    return NextResponse.json({ flags: [], warning: message });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const forbiddenResponse = await requireSuperadmin(request);
    if (forbiddenResponse) return forbiddenResponse;

    return NextResponse.json({ error: message }, { status: 501 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const forbiddenResponse = await requireSuperadmin(request);
    if (forbiddenResponse) return forbiddenResponse;

    return NextResponse.json({ error: message }, { status: 501 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const forbiddenResponse = await requireSuperadmin(request);
    if (forbiddenResponse) return forbiddenResponse;

    return NextResponse.json({ error: message }, { status: 501 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
