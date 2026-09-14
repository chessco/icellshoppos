"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { WHATSAPP_COUNTRY_CODES, normalizeWhatsappDigits } from "@/lib/whatsapp";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsappCountryCode, setWhatsappCountryCode] = useState<(typeof WHATSAPP_COUNTRY_CODES)[number]>("+52");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");

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
    const token = searchParams.get("invite")?.trim() ?? "";
    const invitedEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!token) return;

    setInviteToken(token);
    if (invitedEmail) {
      setEmail(invitedEmail);
      setInviteEmail(invitedEmail);
    }

    let cancelled = false;
    const loadInvite = async () => {
      try {
        const response = await fetch(`/api/org/invites/validate?token=${encodeURIComponent(token)}${invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ""}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !data?.valid) {
          setInviteError(data?.error ?? "Invite is invalid or expired.");
          return;
        }

        setInviteOrgName(String(data?.organization?.name ?? ""));
        const serverEmail = String(data?.invite?.email ?? "").toLowerCase();
        if (serverEmail) {
          setEmail(serverEmail);
          setInviteEmail(serverEmail);
        }
      } catch {
        if (!cancelled) {
          setInviteError("Failed to validate invite link.");
        }
      }
    };

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSendCode = async () => {
    if ((inviteToken ? false : !organizationName.trim()) || !fullName.trim() || !email.trim() || !password) {
      setError("Complete full name, WhatsApp number, email, and password before sending the verification code. Organization name is required unless using an invite.");
      setStatus("");
      return;
    }

    if (normalizeWhatsappDigits(whatsappNumber).length !== 10) {
      setError("Enter a valid 10-digit WhatsApp number.");
      setStatus("");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters before sending the verification code.");
      setStatus("");
      return;
    }

    setSendingCode(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/auth/register/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          fullName,
          whatsappCountryCode,
          whatsappNumber,
          email,
          password,
          inviteToken,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result?.error ?? "Failed to send verification code.");
        return;
      }

      setStatus("Verification code sent. Check your email.");
    } catch {
      setError("Failed to send verification code.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          fullName,
          whatsappCountryCode,
          whatsappNumber,
          email,
          password,
          verificationCode,
          inviteToken,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result?.error ?? "Failed to create account.");
        return;
      }

      router.push("/inventory");
      router.refresh();
    } catch {
      setError("Failed to create account.");
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-[#0f1f3d]">Start Free Trial</h1>
            <p className="mt-1 text-sm text-[#5f7298]">
              {inviteToken ? "Join your team workspace." : "Create your Pro Buyer workspace in minutes."}
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-[#bfd4ff] px-4 py-2 text-xs font-semibold text-[#1f3563] transition hover:bg-[#eef5ff]"
          >
            Login
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
          {inviteToken ? (
            <div className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563]">
              Invited workspace: <strong>{inviteOrgName || "Loading..."}</strong>
            </div>
          ) : (
            <label className="grid gap-2 text-sm text-[#1f3563]">
              Organization Name
              <input
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                required
              />
            </label>
          )}

          <label className="grid gap-2 text-sm text-[#1f3563]">
            Full Name
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
              required
            />
          </label>

          <label className="grid gap-2 text-sm text-[#1f3563]">
            WhatsApp Number
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select
                value={whatsappCountryCode}
                onChange={(event) => setWhatsappCountryCode(event.target.value as (typeof WHATSAPP_COUNTRY_CODES)[number])}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                required
              >
                {WHATSAPP_COUNTRY_CODES.map((countryCode) => (
                  <option key={countryCode} value={countryCode}>
                    {countryCode}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="numeric"
                value={whatsappNumber}
                onChange={(event) => setWhatsappNumber(normalizeWhatsappDigits(event.target.value))}
                className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                placeholder="10-digit number"
                required
              />
            </div>
          </label>

          <label className="grid gap-2 text-sm text-[#1f3563]">
            Work Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
              readOnly={Boolean(inviteEmail)}
              required
            />
          </label>

          <label className="grid gap-2 text-sm text-[#1f3563]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
              required
            />
          </label>

          <div className="grid gap-2 text-sm text-[#1f3563]">
            Verification Code
            <div className="flex flex-wrap gap-2">
              <input
                inputMode="numeric"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="flex-1 rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                placeholder="123456"
                required
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={
                  sendingCode ||
                  (!inviteToken && !organizationName.trim()) ||
                  !fullName.trim() ||
                  normalizeWhatsappDigits(whatsappNumber).length !== 10 ||
                  !email.trim() ||
                  password.length < 8
                }
                className="rounded-full border border-[#bfd4ff] px-4 py-2 text-xs font-semibold text-[#1f3563] transition hover:bg-[#eef5ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingCode ? "Sending..." : "Send Code"}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">
              {error}
            </p>
          )}

          {inviteError && (
            <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">
              {inviteError}
            </p>
          )}

          {status && (
            <p className="rounded-xl border border-[#d6e4ff] bg-[#eef5ff] px-3 py-2 text-sm text-[#29477e]">
              {status}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Start Free Trial"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#5f7298]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#1f3563] underline">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[#5f7298]">
          Loading...
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
