import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing INTEGRATION_ENCRYPTION_KEY (or SESSION_SECRET/JWT_SECRET fallback).");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, authTagB64, encryptedB64] = String(payload).split(":");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
