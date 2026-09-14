import { safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ISecureStorage } from "../ports/ISecureStorage.js";

/**
 * Windows implementation of ISecureStorage using Electron safeStorage (DPAPI).
 *
 * Implements transparent migration from plaintext legacy storage
 * (session.txt) to encrypted persistent storage.
 */
export class WindowsSafeStorageAdapter implements ISecureStorage {
  private readonly storageDirectory: string;
  private readonly encryptedFilePath: string;
  private readonly legacyPlaintextFilePath: string;

  constructor(userDataPath: string) {
    this.storageDirectory = userDataPath;
    this.encryptedFilePath = join(userDataPath, "session.enc");
    this.legacyPlaintextFilePath = join(userDataPath, "session.txt");
  }

  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  async setItem(_key: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) {
      await this.removeItem(_key);
      return;
    }

    if (this.isAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(trimmed);
      writeFileSync(this.encryptedFilePath, encryptedBuffer);
    } else {
      // Fallback only if OS DPAPI is somehow disabled in a restricted environment
      writeFileSync(this.encryptedFilePath, Buffer.from(trimmed, "utf8"));
    }

    // Always clean up any legacy plaintext file on disk
    if (existsSync(this.legacyPlaintextFilePath)) {
      try {
        unlinkSync(this.legacyPlaintextFilePath);
      } catch {
        // Ignore unlink error
      }
    }
  }

  async getItem(_key: string): Promise<string | null> {
    // 1. Try reading encrypted file
    if (existsSync(this.encryptedFilePath)) {
      try {
        const buffer = readFileSync(this.encryptedFilePath);
        if (this.isAvailable()) {
          return safeStorage.decryptString(buffer).trim();
        }
        return buffer.toString("utf8").trim();
      } catch {
        // Corrupted or machine-key mismatch
      }
    }

    // 2. Fallback: migrate legacy plaintext session.txt if present
    if (existsSync(this.legacyPlaintextFilePath)) {
      try {
        const plainText = readFileSync(this.legacyPlaintextFilePath, "utf8").trim();
        if (plainText) {
          // Re-encrypt immediately and clean up legacy plaintext
          await this.setItem(_key, plainText);
          return plainText;
        }
      } catch {
        // Ignore read error
      }
    }

    return null;
  }

  async removeItem(_key: string): Promise<void> {
    if (existsSync(this.encryptedFilePath)) {
      try {
        unlinkSync(this.encryptedFilePath);
      } catch {
        // Ignore
      }
    }
    if (existsSync(this.legacyPlaintextFilePath)) {
      try {
        unlinkSync(this.legacyPlaintextFilePath);
      } catch {
        // Ignore
      }
    }
  }

  async clear(): Promise<void> {
    await this.removeItem("session");
  }
}
