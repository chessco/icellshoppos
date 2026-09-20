import { createHash, randomBytes } from "crypto";

export const INVITE_TOKEN_TTL_HOURS = 72;

export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const createInviteToken = () => randomBytes(32).toString("hex");

export const getInviteExpiry = () => {
  const now = Date.now();
  return new Date(now + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);
};

export const getAppBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return "http://localhost:3007";
};
