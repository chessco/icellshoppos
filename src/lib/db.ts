import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

if (/(user:password@host:5432|@host:5432|@HOST:5432)/.test(databaseUrl)) {
  throw new Error(
    "DATABASE_URL is using a placeholder host. Set the real Postgres connection string in your environment."
  );
}

function getPrismaClient(): PrismaClient {
  // If running in development and the cached global prisma client is missing newly generated models,
  // invalidate it so it reloads with the latest PrismaClient definition.
  if (
    globalThis.prisma &&
    process.env.NODE_ENV === "development" &&
    !("discountAuthorization" in (globalThis.prisma as unknown as Record<string, unknown>))
  ) {
    try {
      (globalThis.prisma as any).$disconnect?.();
    } catch {
      // ignore
    }
    globalThis.prisma = undefined;
  }

  if (!globalThis.prisma) {
    globalThis.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  return globalThis.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const val = (client as any)[prop];
    if (typeof val === "function") {
      return val.bind(client);
    }
    return val;
  },
});

