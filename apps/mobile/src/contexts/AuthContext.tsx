import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { ProBuyerApiClient } from "@ireader/api-client";
import { AuthApplicationService } from "@ireader/application";
import type { SessionMeResponse, IAuthToken } from "@ireader/contracts";
import { CookieAuthToken, BearerAuthToken } from "@ireader/contracts";
import { MobileSecureStorageAdapter } from "../storage/MobileSecureStorageAdapter.js";

interface AuthContextValue {
  session: SessionMeResponse["session"] | null;
  organizations: SessionMeResponse["organizations"];
  activeOrgId: string | null;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  isLoading: boolean;
  requires2FA: boolean;
  loginError: string | null;
  apiClient: ProBuyerApiClient;
  authService: AuthApplicationService;
  login: (email: string, pass: string, code?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState<string>("http://127.0.0.1:3000");
  const [session, setSession] = useState<SessionMeResponse["session"] | null>(null);
  const [organizations, setOrganizations] = useState<SessionMeResponse["organizations"]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const storage = useMemo(() => new MobileSecureStorageAdapter(), []);

  const [currentToken, setCurrentToken] = useState<IAuthToken | null>(null);

  const apiClient = useMemo(() => {
    return new ProBuyerApiClient({
      baseUrl,
      getToken: () => currentToken,
      onUnauthorized: () => {
        setSession(null);
        setCurrentToken(null);
        void storage.removeItem("auth_token");
      },
    });
  }, [baseUrl, currentToken, storage]);

  const authService = useMemo(() => {
    return new AuthApplicationService(apiClient, storage);
  }, [apiClient, storage]);

  // Restore stored session on mount
  useEffect(() => {
    async function restoreSession() {
      setIsLoading(true);
      try {
        const savedUrl = await storage.getItem("base_url");
        if (savedUrl) {
          setBaseUrlState(savedUrl);
          apiClient.setBaseUrl(savedUrl);
        }

        const savedTokenVal = await storage.getItem("auth_token");
        if (savedTokenVal) {
          const token = new CookieAuthToken("icellshop_session", savedTokenVal);
          setCurrentToken(token);
          const meRes = await apiClient.me();
          if (meRes.ok && meRes.data?.session) {
            setSession(meRes.data.session);
            setOrganizations(meRes.data.organizations || []);
            setActiveOrgId(meRes.data.session.activeOrganizationId || null);
          }
        }
      } catch {
        // Continue unauthenticated
      } finally {
        setIsLoading(false);
      }
    }
    void restoreSession();
  }, [storage, apiClient]);

  const setBaseUrl = (url: string) => {
    setBaseUrlState(url);
    apiClient.setBaseUrl(url);
    void storage.setItem("base_url", url);
  };

  const login = async (email: string, pass: string, code?: string): Promise<boolean> => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const res = await apiClient.login({
        baseUrl,
        email,
        password: pass,
        verificationCode: code,
      });

      if (!res.ok) {
        if ((res.data as any)?.requiresVerification) {
          setRequires2FA(true);
          setLoginError(res.error || "Please enter the 6-digit verification code sent to your email.");
          return false;
        }
        setLoginError(res.error || "Login failed");
        return false;
      }

      // Extract session cookie from headers or JSON
      const setCookie = res.rawHeaders?.get("set-cookie") || "";
      const cookieMatch = setCookie.match(/icellshop_session=([^;]+)/i);
      const tokenValue = cookieMatch ? cookieMatch[1] : (res.data as any)?.token;

      if (tokenValue) {
        const token = new CookieAuthToken("icellshop_session", tokenValue);
        setCurrentToken(token);
        await storage.setItem("auth_token", tokenValue);
      }

      setRequires2FA(false);

      // Refresh Me payload
      const meRes = await apiClient.me();
      if (meRes.ok && meRes.data?.session) {
        setSession(meRes.data.session);
        setOrganizations(meRes.data.organizations || []);
        setActiveOrgId(meRes.data.session.activeOrganizationId || null);
      }
      return true;
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Network error");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setSession(null);
    setCurrentToken(null);
    setRequires2FA(false);
    await storage.removeItem("auth_token");
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        organizations,
        activeOrgId,
        baseUrl,
        setBaseUrl,
        isLoading,
        requires2FA,
        loginError,
        apiClient,
        authService,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
