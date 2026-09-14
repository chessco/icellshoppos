import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import { callImeiCheck2Endpoint } from "@/lib/imeicheck2";
import { ensureValidConfirmationToken, forceRefreshConfirmationToken, parseBalanceFromPayload, refreshImeiCheck2Balance } from "../_shared";

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestOrgAccess(request);
    const body = await request.json().catch(() => ({}));

    const serviceId = Number(body?.service_id);
    const imei = typeof body?.imei === "string" ? body.imei.trim() : "";
    const imeis = Array.isArray(body?.imeis)
      ? body.imeis.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
      : [];

    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      return NextResponse.json({ error: "service_id is required." }, { status: 400 });
    }

    if (!imei && imeis.length === 0) {
      return NextResponse.json({ error: "Provide imei or imeis." }, { status: 400 });
    }

    if (imeis.length > 50) {
      return NextResponse.json({ error: "Maximum 50 IMEIs per bulk request." }, { status: 400 });
    }

    const tokenResult = await ensureValidConfirmationToken(access.organizationId);
    if (!tokenResult.ok) {
      return NextResponse.json({ error: tokenResult.error }, { status: tokenResult.status });
    }

    let activeIntegrationRecord = tokenResult.record;

    const payload = {
      confirmation_token: tokenResult.token,
      service_id: serviceId,
      ...(imei ? { imei } : {}),
      ...(imeis.length > 0 ? { imeis } : {}),
    };

    let external = await callImeiCheck2Endpoint("/api/external/imei-check", payload);
    const externalErrorText = String((external.payload as { error?: unknown })?.error ?? "").toLowerCase();
    const tokenRejected =
      external.status === 401 &&
      (externalErrorText.includes("invalid confirmation token") ||
        externalErrorText.includes("expired confirmation token") ||
        externalErrorText.includes("confirmation token"));

    if (tokenRejected) {
      const refreshed = await forceRefreshConfirmationToken(access.organizationId);
      if (refreshed.ok) {
        activeIntegrationRecord = refreshed.record;
        const retryPayload = {
          confirmation_token: refreshed.token,
          service_id: serviceId,
          ...(imei ? { imei } : {}),
          ...(imeis.length > 0 ? { imeis } : {}),
        };
        external = await callImeiCheck2Endpoint("/api/external/imei-check", retryPayload);
      }
    }

    const responsePayload = (external.payload ?? {}) as {
      success?: unknown;
      order_id?: unknown;
      status?: unknown;
      charged?: unknown;
      balance?: unknown;
    };
    const semanticSuccess = external.ok && responsePayload.success !== false;

    const chargedValue = Number(responsePayload.charged);
    const balanceValue = Number(responsePayload.balance);
    await db.imeiCheck2RequestLog.create({
      data: {
        organizationId: access.organizationId,
        serviceId,
        imei: imei || null,
        imeisJson: imeis.length > 0 ? imeis : null,
        orderId: Number.isFinite(Number(responsePayload.order_id)) ? Number(responsePayload.order_id) : null,
        status: responsePayload.status ? String(responsePayload.status) : null,
        charged: Number.isFinite(chargedValue) ? chargedValue : null,
        balance: Number.isFinite(balanceValue) ? balanceValue : null,
        responseJson: external.payload ?? {},
      },
    });

    if (semanticSuccess) {
      await db.externalIntegrationCredential.update({
        where: { id: activeIntegrationRecord.id },
        data: {
          confirmationToken: null,
          tokenExpiresAt: null,
        },
      });

      const responseBalance = parseBalanceFromPayload(external.payload);
      if (responseBalance !== null) {
        await db.externalIntegrationCredential.update({
          where: { id: activeIntegrationRecord.id },
          data: {
            balance: responseBalance,
            balanceUpdatedAt: new Date(),
          },
        });
      }

      await refreshImeiCheck2Balance(access.organizationId).catch(() => null);
    }

    return NextResponse.json(external.payload, {
      status: semanticSuccess ? external.status : external.ok ? 422 : external.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
