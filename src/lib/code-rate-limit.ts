export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "cooldown"; retryAfterSeconds: number; error: string }
  | { allowed: false; reason: "hourly_limit"; retryAfterSeconds: number; error: string };

export const COOLDOWN_SECONDS = 60;
export const MAX_CODES_PER_HOUR = 5;
export const ONE_HOUR_MS = 60 * 60 * 1000;

export type RateLimitDbClient = {
  emailVerificationCode: {
    findFirst: (args: {
      where: {
        email: string;
        purpose: string;
        createdAt: { gte: Date };
      };
      orderBy?: { createdAt: "desc" | "asc" };
      select?: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
    count: (args: {
      where: {
        email: string;
        purpose: string;
        createdAt: { gte: Date };
      };
    }) => Promise<number>;
  };
};

async function getDefaultDb(): Promise<RateLimitDbClient> {
  const { db } = await import("@/lib/db");
  return db;
}

export async function checkEmailCodeRateLimit(
  email: string,
  purpose: string,
  client?: RateLimitDbClient
): Promise<RateLimitResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { allowed: true };
  }

  const dbClient = client ?? (await getDefaultDb());
  const now = new Date();
  const sixtySecondsAgo = new Date(now.getTime() - COOLDOWN_SECONDS * 1000);
  const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);

  // 1. Check for 60s cooldown (1 code per email per 60s)
  const recentCode = await dbClient.emailVerificationCode.findFirst({
    where: {
      email: normalizedEmail,
      purpose,
      createdAt: { gte: sixtySecondsAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recentCode) {
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - recentCode.createdAt.getTime()) / 1000)
    );
    const retryAfterSeconds = Math.max(1, COOLDOWN_SECONDS - elapsedSeconds);
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds,
      error: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
    };
  }

  // 2. Check for hourly limit (max 5 codes per email per hour)
  const countLastHour = await dbClient.emailVerificationCode.count({
    where: {
      email: normalizedEmail,
      purpose,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (countLastHour >= MAX_CODES_PER_HOUR) {
    return {
      allowed: false,
      reason: "hourly_limit",
      retryAfterSeconds: 3600,
      error: "Too many verification requests. Please try again later.",
    };
  }

  return { allowed: true };
}
