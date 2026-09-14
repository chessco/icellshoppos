import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

if (/(user:password@host:5432|@host:5432|@HOST:5432)/.test(databaseUrl)) {
  throw new Error(
    "DATABASE_URL is using a placeholder host. Set the real Postgres connection string in your environment."
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
