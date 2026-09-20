import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import { NativeModules } from "react-native";
import { ProBuyerApiClient } from "@ireader/api-client";
import { AuthApplicationService } from "@ireader/application";
import type { SessionMeResponse, IAuthToken } from "@ireader/contracts";
import { CookieAuthToken, BearerAuthToken } from "@ireader/contracts";
import { MobileSecureStorageAdapter } from "../storage/MobileSecureStorageAdapter";

export const DEFAULT_BACKEND_URL = "https://probuyer.pitayacode.io";

function getInitialBackendUrl(): string {
  // Always prioritize active HTTPS ngrok tunnel to satisfy iOS App Transport Security (ATS)
  if (DEFAULT_BACKEND_URL) {
    return DEFAULT_BACKEND_URL;
  }
  try {
    const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL;
    if (scriptURL && typeof scriptURL === "string") {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
      if (match && match[1] && match[1] !== "localhost" && match[1] !== "127.0.0.1") {
        return `http://${match[1]}:3007`;
      }
    }
  } catch {
    // Fallback on error
  }
  return "http://127.0.0.1:3007";
}

interface AuthContextValue {
  session: SessionMeResponse["session"] | null;
  organizations: SessionMeResponse["organizations"];
  activeOrgId: string | null;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  isLoading: boolean;
  isRestoringSession: boolean;
  savedPassword: string;
  requires2FA: boolean;
  setRequires2FA: (val: boolean) => void;
  loginError: string | null;
  apiClient: ProBuyerApiClient;
  authService: AuthApplicationService;
  login: (email: string, pass: string, code?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState<string>(getInitialBackendUrl);
  const [session, setSession] = useState<SessionMeResponse["session"] | null>(null);
  const [organizations, setOrganizations] = useState<SessionMeResponse["organizations"]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [savedPassword, setSavedPassword] = useState<string>("");
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const storage = useMemo(() => new MobileSecureStorageAdapter(), []);

  const [currentToken, setCurrentTokenState] = useState<IAuthToken | null>(null);
  const currentTokenRef = useRef<IAuthToken | null>(null);

  const setCurrentToken = (token: IAuthToken | null) => {
    currentTokenRef.current = token;
    setCurrentTokenState(token);
  };

  const apiClient = useMemo(() => {
    return new ProBuyerApiClient({
      baseUrl: getInitialBackendUrl(),
      timeoutMs: 6000,
      getToken: () => currentTokenRef.current,
      onUnauthorized: () => {
        setSession(null);
        setCurrentToken(null);
        void storage.removeItem("auth_token");
      },
    });
  }, [storage]);

  const authService = useMemo(() => {
    return new AuthApplicationService(apiClient, storage);
  }, [apiClient, storage]);

  // Restore stored session once on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      setIsRestoringSession(true);
      try {
        let savedUrl = await storage.getItem("base_url");
        if (
          savedUrl &&
          (savedUrl.includes("127.0.0.1") ||
            savedUrl.includes("localhost") ||
            savedUrl.includes("169.254.") ||
            savedUrl.includes(":3000"))
        ) {
          savedUrl = null;
          await storage.removeItem("base_url");
        }

        const effectiveUrl = savedUrl || getInitialBackendUrl();
        if (effectiveUrl && isMounted) {
          setBaseUrlState(effectiveUrl);
          apiClient.setBaseUrl(effectiveUrl);
        }

        const savedTokenVal = await storage.getItem("auth_token");
        if (savedTokenVal && isMounted) {
          const token = new BearerAuthToken(savedTokenVal);
          setCurrentToken(token);
          const meRes = await apiClient.me();
          if (meRes.ok && meRes.data?.session && isMounted) {
            setSession(meRes.data.session);
            setOrganizations(meRes.data.organizations || []);
            setActiveOrgId(meRes.data.session.activeOrganizationId || null);
          } else if (isMounted) {
            setCurrentToken(null);
            void storage.removeItem("auth_token");
          }
        }
      } catch {
        // Continue unauthenticated
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const setBaseUrl = (url: string) => {
    setBaseUrlState(url);
    apiClient.setBaseUrl(url);
    void storage.setItem("base_url", url);
  };

  const pendingPasswordRef = useRef<string>("");

  const login = async (email: string, pass: string, code?: string): Promise<boolean> => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const effectivePassword = pass || savedPassword || pendingPasswordRef.current;
      if (pass) {
        pendingPasswordRef.current = pass;
        setSavedPassword(pass);
      }

      const res = await apiClient.login({
        baseUrl,
        email,
        password: effectivePassword,
        verificationCode: code,
      });

      if ((res.data as any)?.requiresVerification) {
        setRequires2FA(true);
        if (!res.ok) {
          setLoginError(res.error || (res.data as any)?.error || "Please enter the 6-digit verification code.");
        } else {
          setLoginError(null);
        }
        return false;
      }

      if (!res.ok) {
        setLoginError(res.error || "Login failed");
        return false;
      }

      pendingPasswordRef.current = "";
      setSavedPassword("");

      // Extract session token from JSON or cookie header
      const setCookie = res.rawHeaders?.get("set-cookie") || "";
      const cookieMatch = setCookie.match(/icellshop_session=([^;]+)/i);
      const tokenValue = (res.data as any)?.token || (cookieMatch ? cookieMatch[1] : undefined);

      if (tokenValue) {
        const token = new BearerAuthToken(tokenValue);
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
    setSavedPassword("");
    pendingPasswordRef.current = "";
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
        isRestoringSession,
        savedPassword,
        requires2FA,
        setRequires2FA,
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
