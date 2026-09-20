import { NextRequest, NextResponse } from "next/server.js";
import { db } from "../../../../lib/db.ts";

const IMEICHECK2_PROVIDER = "imeicheck2";
const IMEICHECK2_REVOKE_EVENT = "imeicheck2.api_key.revoked";

type UnlinkPayload = {
  event?: string;
  triggered_at?: string;
  user_id?: number | string;
  email?: string;
  key_id?: number | string;
  key_label?: string;
  reason?: string;
  revoked_at?: string;
};

function parseDateOrNull(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function handleImeiCheckUnlinkWebhook(request: NextRequest) {
  try {
    const expectedSecret =
      process.env.IMEICHECK_UNLINK_WEBHOOK_SECRET?.trim() ||
      process.env.PROBUYER_WEBHOOK_SECRET?.trim();
    const providedSecret = request.headers.get("x-probuyer-secret")?.trim();

    if (!expectedSecret) {
      return NextResponse.json({ error: "Webhook endpoint not configured" }, { status: 503 });
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as UnlinkPayload;
    const event = String(body?.event ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const reason = String(body?.reason ?? "manual_revoke").trim() || "manual_revoke";
    const keyId = String(body?.key_id ?? "").trim() || null;
    const keyLabel = String(body?.key_label ?? "").trim() || null;
    const providerUserId = String(body?.user_id ?? "").trim() || null;
    const revokedAt = parseDateOrNull(body?.revoked_at) ?? new Date();
    const triggeredAt = parseDateOrNull(body?.triggered_at) ?? new Date();

    if (event !== IMEICHECK2_REVOKE_EVENT) {
      return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
    }

    const matchingIntegrations = email
      ? await db.externalIntegrationCredential.findMany({
          where: {
            provider: IMEICHECK2_PROVIDER,
            email,
          },
          select: {
            id: true,
            organizationId: true,
            email: true,
          },
        })
      : [];

    if (matchingIntegrations.length > 0) {
      await db.auditLog.createMany({
        data: matchingIntegrations.map((integration) => ({
          organizationId: integration.organizationId,
          actorUserId: null,
          action: "integrations.imeicheck2.unlinked.webhook",
          entity: "ExternalIntegrationCredential",
          entityId: integration.id,
          meta: {
            event,
            email: integration.email,
            providerUserId,
            keyId,
            keyLabel,
            reason,
            revokedAt: revokedAt.toISOString(),
            triggeredAt: triggeredAt.toISOString(),
          },
        })),
      });
    }

    const deleted = await db.externalIntegrationCredential.deleteMany({
      where: {
        provider: IMEICHECK2_PROVIDER,
        ...(email ? { email } : { id: "__none__" }),
      },
    });

    return NextResponse.json({
      success: true,
      event,
      email: email || null,
      providerUserId,
      keyId,
      reason,
      revokedAt: revokedAt.toISOString(),
      triggeredAt: triggeredAt.toISOString(),
      unlinkedCount: deleted.count,
      alreadyUnlinked: deleted.count === 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
