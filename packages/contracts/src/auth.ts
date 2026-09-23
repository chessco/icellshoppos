/**
 * iReader Multiplatform Architecture v2.0 - Core Auth Contracts
 *
 * Canonical contracts for Pro Buyer authentication, multi-tenant session
 * resolution, and step-up verification (2FA).
 *
 * Designed to be consumed by:
 *  - iReader Windows (Electron)
 *  - iReader macOS (Electron/Native)
 *  - iReader iPad POS (React Native + Expo)
 *  - iReader iPhone (React Native + Expo)
 */

export type UserRole = "superadmin" | "admin" | "staff";

export interface SessionMembership {
  organizationId: string;
  role: UserRole;
  permissions?: Record<string, boolean> | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName?: string | null;
  isSuperadmin: boolean;
  activeOrganizationId?: string | null;
  memberships: SessionMembership[];
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug?: string;
  role?: UserRole;
}

/** Payload sent to initiate or complete a login */
export interface LoginRequestPayload {
  baseUrl: string;
  email: string;
  password: string;
  /** 6-digit numeric verification code for superadmin / 2FA step-up */
  verificationCode?: string;
  organizationId?: string;
}

/** Response received from the Pro Buyer API login endpoint */
export interface LoginResponsePayload {
  ok: boolean;
  /** True if the account requires a 2FA verification code */
  requiresVerification?: boolean;
  expiresInMinutes?: number;
  cooldownSeconds?: number;
  message?: string;
  error?: string;
  user?: AuthenticatedUser;
  organizations?: AuthOrganization[];
}

/** Response received from /api/auth/me */
export interface SessionMeResponse {
  session?: {
    userId: string;
    email: string;
    isSuperadmin: boolean;
    activeOrganizationId?: string | null;
    preferredLanguage?: string;
    memberships: SessionMembership[];
  };
  organizations?: AuthOrganization[];
  permissions?: Record<string, boolean> | null;
  role?: string | null;
}
