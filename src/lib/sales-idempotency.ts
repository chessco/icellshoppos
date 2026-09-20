import { Prisma } from "@prisma/client";

export interface ExistingSaleItemRecord {
  id?: string;
  inventoryItemId?: string;
  imei?: string;
  model?: string;
  capacity?: string;
  color?: string;
  salePrice: number;
}

export interface ExistingSaleCustomerRecord {
  id?: string;
  name: string;
  email?: string;
  whatsapp?: string;
}

export interface ExistingSaleRecord {
  id: string;
  saleNumber: string;
  total: number;
  paymentMethod?: string;
  createdAt?: string | Date;
  customer?: ExistingSaleCustomerRecord;
  items?: ExistingSaleItemRecord[];
}

export interface IdempotentReplayResponse {
  success: true;
  saleId: string;
  saleNumber: string;
  total: number;
  items: ExistingSaleItemRecord[];
  paymentMethod?: string;
  customer?: ExistingSaleCustomerRecord;
  createdAt?: string;
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
      paymentMethod: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          whatsapp: true,
        },
      },
      items: {
        select: {
          id: true,
          inventoryItemId: true,
          imei: true,
          model: true,
          capacity: true,
          color: true,
          salePrice: true,
        },
      },
    },
  });

  if (!existing) {
    return null;
  }

  return {
    id: existing.id,
    saleNumber: existing.saleNumber,
    total: Number(existing.total),
    paymentMethod: existing.paymentMethod ?? undefined,
    createdAt: existing.createdAt
      ? typeof existing.createdAt === "string"
        ? existing.createdAt
        : existing.createdAt.toISOString()
      : undefined,
    customer: existing.customer
      ? {
          id: existing.customer.id,
          name: existing.customer.name,
          email: existing.customer.email ?? undefined,
          whatsapp: existing.customer.whatsapp ?? undefined,
        }
      : undefined,
    items: (existing.items || []).map((item: any) => ({
      id: item.id,
      inventoryItemId: item.inventoryItemId ?? undefined,
      imei: item.imei ?? undefined,
      model: item.model ?? undefined,
      capacity: item.capacity ?? undefined,
      color: item.color ?? undefined,
      salePrice: Number(item.salePrice),
    })),
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
    saleNumber: sale.saleNumber,
    total: sale.total,
    items: (sale.items || []).map((item) => ({
      id: item.id,
      inventoryItemId: item.inventoryItemId ?? undefined,
      imei: item.imei,
      model: item.model,
      capacity: item.capacity,
      color: item.color,
      salePrice: Number(item.salePrice),
    })),
    paymentMethod: sale.paymentMethod ?? undefined,
    customer: sale.customer
      ? {
          id: sale.customer.id ?? undefined,
          name: sale.customer.name,
          email: sale.customer.email ?? undefined,
          whatsapp: sale.customer.whatsapp ?? undefined,
        }
      : undefined,
    createdAt: sale.createdAt
      ? typeof sale.createdAt === "string"
        ? sale.createdAt
        : sale.createdAt.toISOString()
      : undefined,
    idempotentReplay: true,
  };
}
