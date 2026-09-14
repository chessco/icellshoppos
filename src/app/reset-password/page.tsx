"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError("Missing or invalid reset token.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Failed to reset password.");
      } else {
        setSuccess("Password reset! You can now sign in.");
        setTimeout(() => router.push("/login"), 2000);
      }
    } catch {
      setError("Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#eddac7] bg-white p-6 shadow-[0_25px_60px_rgba(90,62,45,0.1)]">
        <h1 className="text-3xl font-semibold text-[#1f1a16]">Reset Password</h1>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
          <label className="grid gap-2 text-sm text-[#3b2a1e]">
            New Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
              required
              minLength={8}
            />
          </label>
          <label className="grid gap-2 text-sm text-[#3b2a1e]">
            Confirm Password
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="rounded-xl border border-[#e6d6c6] bg-[#fffaf3] px-3 py-2 outline-none focus:border-[#1f1a16]"
              required
              minLength={8}
            />
          </label>
          {error && (
            <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">{error}</p>
          )}
          {success && (
            <p className="rounded-xl border border-[#d1ffd9] bg-[#f3fff6] px-3 py-2 text-sm text-[#2a7c3b]">{success}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Loading...</div>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
