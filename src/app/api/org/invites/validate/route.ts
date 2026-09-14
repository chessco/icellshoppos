import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashInviteToken } from "@/lib/org-invites";

const inviteDelegate = db as unknown as {
  organizationInvite: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
};

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);

    const invite = (await inviteDelegate.organizationInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        role: true,
        permissionsJson: true,
        status: true,
        expiresAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })) as
      | {
          id: string;
          email: string;
          role: "superadmin" | "admin" | "staff";
          permissionsJson: unknown;
          status: string;
          expiresAt: Date;
          organization: {
            id: string;
            name: string;
          };
        }
      | null;

    if (!invite) {
      return NextResponse.json({ valid: false, error: "Invite not found." }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json({ valid: false, error: "Invite is no longer active." }, { status: 400 });
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ valid: false, error: "Invite has expired." }, { status: 400 });
    }

    if (email && email !== invite.email.toLowerCase()) {
      return NextResponse.json({ valid: false, error: "Invite email mismatch." }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        permissionsJson: invite.permissionsJson,
        expiresAt: invite.expiresAt,
      },
      organization: invite.organization,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
