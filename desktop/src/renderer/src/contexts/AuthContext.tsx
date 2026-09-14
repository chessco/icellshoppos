import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import type { SessionMeResponse } from "@ireader/contracts";

interface AuthContextType {
  session: SessionMeResponse | null;
  busy: boolean;
  status: string;
  requiresVerification: boolean;
  verificationCode: string;
  verificationCooldownSeconds: number;
  setVerificationCode: (code: string) => void;
  setRequiresVerification: (req: boolean) => void;
  login: (email: string, pass: string, baseUrl: string) => Promise<void>;
  logout: () => Promise<void>;
  setStatus: (s: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const [session, setSession] = useState<DesktopSessionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationCooldownSeconds, setVerificationCooldownSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const nextSession = await window.desktop.auth.me({ baseUrl: baseUrl.trim() });
        if (!cancelled) {
          setSession(nextSession);
          setStatus("Session restored.");
        }
      } catch {
        if (!cancelled) setStatus("Sign in to sync intake.");
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const login = async (email: string, pass: string, url: string) => {
    setBusy(true);
    setStatus(requiresVerification ? "Verifying 2FA code..." : "Signing in...");
    try {
      const response = await window.desktop.auth.login({
        baseUrl: url.trim(),
        email: email.trim(),
        password: pass,
        verificationCode: requiresVerification ? verificationCode : undefined,
      });

      if ((response as { requiresVerification?: boolean })?.requiresVerification) {
        setRequiresVerification(true);
        setVerificationCode("");
        const cooldown = (response as { cooldownSeconds?: number })?.cooldownSeconds;
        if (typeof cooldown === "number") {
          setVerificationCooldownSeconds(cooldown);
        }
        setStatus((response as { message?: string })?.message || "2FA code sent to your email.");
        return;
      }

      setRequiresVerification(false);
      setVerificationCode("");
      setSession(response as SessionMeResponse);
      setStatus("Signed in. Desktop session is ready.");
      await window.desktop.notify("iReader by Pro Buyer", "Signed in successfully.");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Login failed.";
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await window.desktop.auth.logout();
      setSession(null);
      setStatus("Signed out locally.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        busy,
        status,
        requiresVerification,
        verificationCode,
        verificationCooldownSeconds,
        setVerificationCode,
        setRequiresVerification,
        login,
        logout,
        setStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
