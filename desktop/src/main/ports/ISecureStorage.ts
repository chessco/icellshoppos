/**
 * iReader Multiplatform Architecture v2.0 - Core Storage Port
 *
 * Platform-independent abstraction for secure storage of credentials,
 * access tokens, and sensitive runtime values.
 *
 * Implementations:
 *  - Windows: DPAPI via Electron safeStorage (Windows Credential Store)
 *  - macOS / iOS / iPadOS: Keychain Services abstraction
 */

export interface ISecureStorage {
  /** Returns whether the platform's hardware/OS encryption engine is available */
  isAvailable(): boolean;

  /** Encrypts and securely stores a string value associated with a key */
  setItem(key: string, value: string): Promise<void>;

  /** Retrieves and decrypts a string value associated with a key, or null if not found */
  getItem(key: string): Promise<string | null>;

  /** Permanently deletes a stored item */
  removeItem(key: string): Promise<void>;

  /** Clears all items managed by this secure storage instance */
  clear(): Promise<void>;
}
