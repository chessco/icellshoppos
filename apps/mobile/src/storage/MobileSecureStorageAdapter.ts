import type { ISecureStorage } from "@ireader/contracts";

/**
 * MobileSecureStorageAdapter
 *
 * Implements ISecureStorage for Apple / Mobile platforms.
 * Uses native secure storage (e.g. Apple Keychain via expo-secure-store)
 * when available, falling back gracefully to in-memory secure vault
 * in test runners or environments without native keychain bindings.
 */
export class MobileSecureStorageAdapter implements ISecureStorage {
  private memoryStore = new Map<string, string>();
  private nativeStore: any = null;

  constructor() {
    try {
      // Dynamic require so module is optional when building headlessly or in node tests
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require("expo-secure-store");
      this.nativeStore = SecureStore;
    } catch {
      this.nativeStore = null;
    }
  }

  isAvailable(): boolean {
    return true;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.nativeStore && typeof this.nativeStore.setItemAsync === "function") {
      try {
        await this.nativeStore.setItemAsync(key, value, {
          keychainAccessible: this.nativeStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        return;
      } catch {
        // Fallback to memory on failure
      }
    }
    this.memoryStore.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    if (this.nativeStore && typeof this.nativeStore.getItemAsync === "function") {
      try {
        const val = await this.nativeStore.getItemAsync(key);
        if (val !== null && val !== undefined) return val;
      } catch {
        // Fallback to memory
      }
    }
    return this.memoryStore.get(key) ?? null;
  }

  async removeItem(key: string): Promise<void> {
    if (this.nativeStore && typeof this.nativeStore.deleteItemAsync === "function") {
      try {
        await this.nativeStore.deleteItemAsync(key);
      } catch {
        // Fallback to memory
      }
    }
    this.memoryStore.delete(key);
  }

  async clear(): Promise<void> {
    this.memoryStore.clear();
  }

  // ─── IAuthStoragePort Compliance ──────────────────────────────────────────
  async saveSessionCookie(cookie: string): Promise<void> {
    await this.setItem("auth_token", cookie);
  }

  async getSessionCookie(): Promise<string | null> {
    return this.getItem("auth_token");
  }

  async clearSessionCookie(): Promise<void> {
    await this.removeItem("auth_token");
  }
}
