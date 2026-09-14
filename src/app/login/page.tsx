"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [queryParams, setQueryParams] = useState(() => new URLSearchParams());

  useEffect(() => {
    const updateQueryParams = () => {
      setQueryParams(new URLSearchParams(window.location.search));
    };
    updateQueryParams();
    window.addEventListener("popstate", updateQueryParams);
    return () => window.removeEventListener("popstate", updateQueryParams);
  }, []);

  const nextPath = useMemo(() => {
    const next = queryParams.get("next");
    if (!next || !next.startsWith("/")) return "/inventory";
    if (next.startsWith("/login")) return "/inventory";
    return next;
  }, [queryParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [verificationCooldownSeconds, setVerificationCooldownSeconds] = useState(0);
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!mounted) return;
        setIsAuthenticated(response.ok);
      } catch {
        if (!mounted) return;
        setIsAuthenticated(false);
      }
    };

    void loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (verificationCooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setVerificationCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verificationCooldownSeconds]);

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetLoading(true);
    setResetMessage("");
    setResetError("");
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setResetError(result?.message ?? "Failed to request password reset.");
      } else {
        setResetMessage(result.message);
      }
    } catch {
      setResetError("Failed to request password reset.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          verificationCode: requiresVerification ? verificationCode : undefined,
        }),
      });
      const result = await response.json();

      if (response.ok && result?.requiresVerification) {
        setRequiresVerification(true);
        setVerificationCode("");
        if (typeof result?.cooldownSeconds === "number") {
          setVerificationCooldownSeconds(Math.max(0, Math.floor(result.cooldownSeconds)));
        }
        setInfoMessage(
          result?.message ??
            "Verification code sent to your email. Enter the 6-digit code to continue."
        );
        return;
      }

      if (!response.ok) {
        if (result?.requiresVerification) {
          setRequiresVerification(true);
        }
        if (typeof result?.cooldownSeconds === "number") {
          setVerificationCooldownSeconds(Math.max(0, Math.floor(result.cooldownSeconds)));
        }
        setError(result?.error ?? "Failed to sign in.");
        return;
      }

      setRequiresVerification(false);
      setVerificationCode("");
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (verificationCooldownSeconds > 0 || loading) return;
    setLoading(true);
    setError("");
    setInfoMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (typeof result?.cooldownSeconds === "number") {
          setVerificationCooldownSeconds(Math.max(0, Math.floor(result.cooldownSeconds)));
        }
        setError(result?.error ?? "Could not resend verification code.");
        return;
      }

      setRequiresVerification(true);
      setVerificationCode("");
      if (typeof result?.cooldownSeconds === "number") {
        setVerificationCooldownSeconds(Math.max(0, Math.floor(result.cooldownSeconds)));
      }
      setInfoMessage(result?.message ?? "Verification code resent to your email.");
    } catch {
      setError("Could not resend verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <nav className="fixed inset-x-0 top-0 z-30 border-b border-[#d6e4ff] bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
            <Link
              href="https://www.probuyer.org"
              className="inline-flex items-center"
            >
            <img
              src="/api/public/app-brand-logo"
              alt="Website logo"
              className="h-7 w-auto max-w-[200px] object-contain"
            />
          </Link>
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="rounded-full border border-[#bfd4ff] px-4 py-2 text-sm font-semibold text-[#1f3563] transition hover:bg-[#eef5ff]"
            >
              Dashboard
            </Link>
          )}
        </div>
      </nav>
      <section className="w-full max-w-md rounded-3xl border border-[#d6e4ff] bg-white p-6 shadow-[0_22px_54px_rgba(37,99,235,0.12)]">
        <h1 className="text-3xl font-semibold text-[#0f1f3d]">Sign In</h1>
        <p className="mt-1 text-sm text-[#5f7298]">Access your Pro Buyer workspace.</p>

        {showReset ? (
          <form onSubmit={handleReset} className="mt-6 grid gap-3">
            <label className="grid gap-2 text-sm text-[#1f3563]">
              Enter your email to reset password
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                required
              />
            </label>
            {resetMessage && (
              <p className="rounded-xl border border-[#d1ffd9] bg-[#f3fff6] px-3 py-2 text-sm text-[#2a7c3b]">{resetMessage}</p>
            )}
            {resetError && (
              <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">{resetError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={resetLoading}
                className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                className="rounded-full border border-[#bfd4ff] px-5 py-2 text-sm font-semibold text-[#1f3563] hover:bg-[#eef5ff]"
                onClick={() => setShowReset(false)}
              >
                Back to Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
            <label className="grid gap-2 text-sm text-[#1f3563]">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setRequiresVerification(false);
                  setVerificationCode("");
                  setVerificationCooldownSeconds(0);
                  setInfoMessage("");
                }}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                required
              />
            </label>
            <label className="grid gap-2 text-sm text-[#1f3563]">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setRequiresVerification(false);
                  setVerificationCode("");
                  setVerificationCooldownSeconds(0);
                  setInfoMessage("");
                }}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                required
              />
            </label>
            {requiresVerification && (
              <label className="grid gap-2 text-sm text-[#1f3563]">
                Verification code
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                  placeholder="6-digit code"
                  required
                />
              </label>
            )}
            {infoMessage && (
              <p className="rounded-xl border border-[#d6e4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563]">{infoMessage}</p>
            )}
            {error && (
              <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : requiresVerification ? "Verify & Sign In" : "Sign In"}
            </button>
            {requiresVerification && (
              <button
                type="button"
                className="mt-1 w-fit text-xs text-[#4b6292] underline"
                onClick={() => {
                  setRequiresVerification(false);
                  setVerificationCode("");
                  setVerificationCooldownSeconds(0);
                  setInfoMessage("");
                  setError("");
                }}
              >
                Start over
              </button>
            )}
            {requiresVerification && (
              <button
                type="button"
                className="mt-1 w-fit text-xs text-[#4b6292] underline disabled:no-underline disabled:opacity-60"
                onClick={() => void handleResendVerificationCode()}
                disabled={loading || verificationCooldownSeconds > 0}
              >
                {verificationCooldownSeconds > 0
                  ? `Resend code in ${verificationCooldownSeconds}s`
                  : "Resend verification code"}
              </button>
            )}
            <button
              type="button"
              className="mt-1 w-fit text-xs text-[#4b6292] underline"
              onClick={() => setShowReset(true)}
            >
              Forgot password?
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-[#5f7298]">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-[#1f3563] underline">
            Register free
          </Link>
        </p>
      </section>
    </main>
  );
}
