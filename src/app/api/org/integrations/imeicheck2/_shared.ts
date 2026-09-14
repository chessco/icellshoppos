import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/integration-secrets";
import { callImeiCheck2Endpoint, callImeiCheck2Init } from "@/lib/imeicheck2";

export const IMEICHECK2_PROVIDER = "imeicheck2";

type IntegrationRecord = {
  id: string;
  organizationId: string;
  provider: string;
  email: string;
  apiKeyEncrypted: string;
  keyLast4: string;
  confirmationToken: string | null;
  tokenExpiresAt: Date | null;
  servicePricingJson: unknown;
  pricingUpdatedAt: Date | null;
  balance: unknown;
  balanceUpdatedAt: Date | null;
};

export function parseBalanceFromPayload(payload: unknown): number | null {
  const value = payload as {
    balance?: unknown;
    available_balance?: unknown;
    account?: { balance?: unknown; available_balance?: unknown };
  };

  const candidates = [
    Number(value?.balance),
    Number(value?.available_balance),
    Number(value?.account?.balance),
    Number(value?.account?.available_balance),
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function getImeiCheck2Integration(organizationId: string): Promise<IntegrationRecord | null> {
  return db.externalIntegrationCredential.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: IMEICHECK2_PROVIDER,
      },
    },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      email: true,
      apiKeyEncrypted: true,
      keyLast4: true,
      confirmationToken: true,
      tokenExpiresAt: true,
      servicePricingJson: true,
      pricingUpdatedAt: true,
      balance: true,
      balanceUpdatedAt: true,
    },
  });
}

export async function ensureValidConfirmationToken(organizationId: string) {
  const record = await getImeiCheck2Integration(organizationId);
  if (!record) {
    return {
      ok: false as const,
      status: 404,
      error: "imeicheck2 integration is not linked.",
    };
  }

  const validUntil = record.tokenExpiresAt?.getTime() ?? 0;
  if (record.confirmationToken && validUntil > Date.now() + 15_000) {
    return {
      ok: true as const,
      token: record.confirmationToken,
      record,
    };
  }

  const apiKey = decryptSecret(record.apiKeyEncrypted);
  const refreshed = await callImeiCheck2Init({ apiKey, email: record.email });

  if (!refreshed.ok) {
    return {
      ok: false as const,
      status: 502,
      error: refreshed.error,
    };
  }

  const expiresAt = new Date(Date.now() + Math.max(60, refreshed.expiresIn) * 1000);
  await db.externalIntegrationCredential.update({
    where: { id: record.id },
    data: {
      confirmationToken: refreshed.token,
      tokenExpiresAt: expiresAt,
    },
  });

  return {
    ok: true as const,
    token: refreshed.token,
    record,
  };
}

export async function forceRefreshConfirmationToken(organizationId: string) {
  const record = await getImeiCheck2Integration(organizationId);
  if (!record) {
    return {
      ok: false as const,
      status: 404,
      error: "imeicheck2 integration is not linked.",
    };
  }

  const apiKey = decryptSecret(record.apiKeyEncrypted);
  const refreshed = await callImeiCheck2Init({ apiKey, email: record.email });
  if (!refreshed.ok) {
    return {
      ok: false as const,
      status: 502,
      error: refreshed.error,
    };
  }

  const expiresAt = new Date(Date.now() + Math.max(60, refreshed.expiresIn) * 1000);
  await db.externalIntegrationCredential.update({
    where: { id: record.id },
    data: {
      confirmationToken: refreshed.token,
      tokenExpiresAt: expiresAt,
    },
  });

  return {
    ok: true as const,
    token: refreshed.token,
    record,
  };
}

export async function refreshImeiCheck2Balance(organizationId: string) {
  const tokenResult = await ensureValidConfirmationToken(organizationId);
  if (!tokenResult.ok) {
    return null;
  }

  const serviceProbe = await callImeiCheck2Endpoint("/api/external/services", {
    confirmation_token: tokenResult.token,
  });

  let balance = parseBalanceFromPayload(serviceProbe.payload);
  if (balance === null) {
    const orderProbe = await callImeiCheck2Endpoint("/api/external/orders", {
      confirmation_token: tokenResult.token,
      limit: 1,
    });
    balance = parseBalanceFromPayload(orderProbe.payload);
  }

  if (balance === null) {
    return null;
  }

  await db.externalIntegrationCredential.update({
    where: { id: tokenResult.record.id },
    data: {
      balance,
      balanceUpdatedAt: new Date(),
    },
  });

  return balance;
}
