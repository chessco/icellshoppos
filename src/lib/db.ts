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

export const db =
  globalThis.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}
