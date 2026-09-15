import { Prisma } from "@prisma/client";

export interface ExistingSaleRecord {
  id: string;
  saleNumber: string;
  total: number;
}

export interface IdempotentReplayResponse {
  success: true;
  saleId: string;
  total: number;
  idempotentReplay: true;
}

/**
 * Searches for an existing sale by organizationId and saleId (idempotency key).
 * Enforces organization scoping: NEVER search by saleId alone.
 */
export async function findSaleByIdempotencyKey(
  organizationId: string,
  saleId: string,
  databaseClient?: any
): Promise<ExistingSaleRecord | null> {
  const normalizedSaleId = String(saleId ?? "").trim();
  if (!normalizedSaleId || !organizationId) {
    return null;
  }

  const client = databaseClient ?? (await import("./db.ts")).db;

  const existing = await client.sale.findUnique({
    where: {
      organizationId_saleNumber: {
        organizationId,
        saleNumber: normalizedSaleId,
      },
    },
    select: {
      id: true,
      saleNumber: true,
      total: true,
    },
  });

  if (!existing) {
    return null;
  }

  return {
    id: existing.id,
    saleNumber: existing.saleNumber,
    total: Number(existing.total),
  };
}

/**
 * Determines if an error is a Prisma P2002 unique constraint conflict
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  ) {
    return true;
  }
  return false;
}

/**
 * Builds the standard idempotent replay response payload.
 */
export function buildIdempotentReplayResponse(
  sale: ExistingSaleRecord
): IdempotentReplayResponse {
  return {
    success: true,
    saleId: sale.saleNumber,
    total: sale.total,
    idempotentReplay: true,
  };
}
