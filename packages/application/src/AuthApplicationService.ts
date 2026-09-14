import type { ProBuyerApiClient } from "@ireader/api-client";
import type { LoginRequestPayload, LoginResponsePayload, SessionMeResponse } from "@ireader/contracts";

export interface IAuthStoragePort {
  saveSessionCookie(cookie: string): Promise<void>;
  getSessionCookie(): Promise<string | null>;
  clearSessionCookie(): Promise<void>;
}

export class AuthApplicationService {
  constructor(
    private readonly apiClient: ProBuyerApiClient,
    private readonly storagePort: IAuthStoragePort
  ) {}

  async login(payload: LoginRequestPayload): Promise<LoginResponsePayload> {
    const result = await this.apiClient.login(payload);

    if (!result.ok || !result.data) {
      return {
        ok: false,
        requiresVerification: result.data?.requiresVerification,
        cooldownSeconds: result.data?.cooldownSeconds,
        error: result.error || "Login failed",
      };
    }

    if (result.data.requiresVerification) {
      return {
        ok: true,
        requiresVerification: true,
        expiresInMinutes: result.data.expiresInMinutes,
        cooldownSeconds: result.data.cooldownSeconds,
        message: result.data.message || "Verification code sent to your email.",
      };
    }

    const cookieHeader = result.rawHeaders.get("set-cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/icellshop_session=[^;]+/i);
      if (match?.[0]) {
        await this.storagePort.saveSessionCookie(match[0]);
      }
    }

    return {
      ok: true,
      user: result.data.user,
      organizations: result.data.organizations,
    };
  }

  async restoreSession(): Promise<SessionMeResponse | null> {
    const cookie = await this.storagePort.getSessionCookie();
    if (!cookie) return null;

    const me = await this.apiClient.me();
    if (!me.ok || !me.data) {
      await this.storagePort.clearSessionCookie();
      return null;
    }

    return me.data;
  }

  async logout(): Promise<void> {
    await this.storagePort.clearSessionCookie();
  }
}
