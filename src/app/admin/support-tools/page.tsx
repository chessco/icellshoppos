"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";

export default function AdminSupportToolsPage() {
  const pathname = usePathname();

  // Impersonate User state
  const [impersonateUserId, setImpersonateUserId] = useState("");
  const [impersonateResult, setImpersonateResult] = useState<string | null>(
    null,
  );
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  // Reset User Password state
  // View User Activity Logs state
  const [logsEmail, setLogsEmail] = useState("");
  const [logs, setLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const handleViewLogs = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogsLoading(true);
    setLogsError(null);
    setLogs(null);
    try {
      const res = await fetch(
        `/api/admin/support-tools/user-activity-logs?email=${encodeURIComponent(logsEmail)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLogsError(data.message || "Failed to fetch logs");
      } else {
        setLogs(data.logs);
      }
    } catch (err: any) {
      setLogsError(err?.message || "Unknown error");
    } finally {
      setLogsLoading(false);
    }
  };
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [brandLogoVersion, setBrandLogoVersion] = useState(0);
  const [brandLogoUploading, setBrandLogoUploading] = useState(false);
  const [brandLogoMessage, setBrandLogoMessage] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetResult(null);
    try {
      const res = await fetch("/api/admin/support-tools/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, newPassword: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResetError(data.message || "Failed to reset password");
      } else {
        setResetResult("Password reset successfully.");
      }
    } catch (err: any) {
      setResetError(err?.message || "Unknown error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    setImpersonateLoading(true);
    setImpersonateError(null);
    setImpersonateResult(null);
    try {
      const res = await fetch("/api/admin/support-tools/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: impersonateUserId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setImpersonateError(data.message || "Failed to impersonate user");
      } else {
        setImpersonateResult(`Impersonation token: ${data.impersonationToken}`);
      }
    } catch (err: any) {
      setImpersonateError(err?.message || "Unknown error");
    } finally {
      setImpersonateLoading(false);
    }
  };

  const handleUploadBrandLogo = async (file: File | null) => {
    if (!file) return;
    setBrandLogoUploading(true);
    setBrandLogoMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/admin/app-brand-logo", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBrandLogoMessage(data?.error ?? "Failed to upload brand logo.");
        return;
      }

      setBrandLogoVersion((value) => value + 1);
      setBrandLogoMessage("Global website logo updated.");
    } catch {
      setBrandLogoMessage("Failed to upload brand logo.");
    } finally {
      setBrandLogoUploading(false);
    }
  };

  const handleDeleteBrandLogo = async () => {
    setBrandLogoUploading(true);
    setBrandLogoMessage(null);
    try {
      const response = await fetch("/api/admin/app-brand-logo", {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBrandLogoMessage(data?.error ?? "Failed to remove brand logo.");
        return;
      }

      setBrandLogoVersion((value) => value + 1);
      setBrandLogoMessage(
        "Global website logo removed. Fallback text will be shown.",
      );
    } catch {
      setBrandLogoMessage("Failed to remove brand logo.");
    } finally {
      setBrandLogoUploading(false);
    }
  };

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#eddac7] bg-[rgba(255,250,243,0.95)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#5c4332]">
          <span className="font-bold">Super Admin &gt; Support Tools</span>
        </div>
      </nav>
      <div className="grid w-full md:grid-cols-[220px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-8 px-6 py-10">
          <header>
            <h1 className="text-3xl font-semibold text-[#1f1a16]">
              Support Tools
            </h1>
            <p className="text-sm text-[#6a4d3a]">
              Access tools to assist users, troubleshoot issues, and manage
              support operations.
            </p>
          </header>
          <section className="rounded-2xl border border-[#e6d6c6] bg-white p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">
                Quick Actions
              </h2>
              <div className="mb-4 space-y-4">
                {/* System Health Check */}
                <div>
                  <a
                    href="/api/system-health"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded bg-green-100 px-4 py-2 text-green-800 font-medium hover:bg-green-200 transition"
                  >
                    Troubleshooting: Check System Health
                  </a>
                </div>
                {/* Impersonate User */}
                <form
                  onSubmit={handleImpersonate}
                  className="flex flex-wrap items-end gap-2"
                >
                  <label className="flex flex-col text-sm">
                    Impersonate User ID
                    <input
                      type="text"
                      value={impersonateUserId}
                      onChange={(e) => setImpersonateUserId(e.target.value)}
                      className="rounded-xl border border-[#e6d6c6] px-2 py-1 mt-1"
                      placeholder="Enter user ID"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white"
                    disabled={impersonateLoading}
                  >
                    {impersonateLoading ? "Impersonating..." : "Impersonate"}
                  </button>
                </form>
                {impersonateResult && (
                  <div className="mt-2 text-green-700 break-all">
                    {impersonateResult}
                  </div>
                )}
                {impersonateError && (
                  <div className="mt-2 text-red-600">{impersonateError}</div>
                )}

                {/* Reset User Password */}
                <form
                  onSubmit={handleResetPassword}
                  className="flex flex-wrap items-end gap-2 mt-4"
                >
                  <label className="flex flex-col text-sm">
                    Reset User Email
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="rounded-xl border border-[#e6d6c6] px-2 py-1 mt-1"
                      placeholder="Enter user email"
                      required
                    />
                  </label>
                  <label className="flex flex-col text-sm">
                    New Password
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="rounded-xl border border-[#e6d6c6] px-2 py-1 mt-1"
                      placeholder="Enter new password"
                      required
                      minLength={8}
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white"
                    disabled={resetLoading}
                  >
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </button>
                </form>
                {resetResult && (
                  <div className="mt-2 text-green-700">{resetResult}</div>
                )}
                {resetError && (
                  <div className="mt-2 text-red-600">{resetError}</div>
                )}

                <div className="mt-6 rounded-2xl border border-[#e6d6c6] bg-[#fffaf3] p-4">
                  <h3 className="text-sm font-semibold text-[#1f1a16]">
                    Global Website Logo
                  </h3>
                  <p className="mt-1 text-xs text-[#6a4d3a]">
                    This logo replaces Pro Buyer branding in landing, login,
                    register, and sidebar.
                  </p>

                  <div className="mt-3 rounded-xl border border-[#e6d6c6] bg-white p-3">
                    <Link
                      href="https://www.probuyer.org"
                      className="inline-flex items-center"
                    >
                      <img
                        src={`/api/public/app-brand-logo?v=${brandLogoVersion}`}
                        alt="Global website logo"
                        className="h-10 w-auto max-w-full object-contain"
                      />
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-full border border-[#e6d6c6] bg-white px-3 py-2 text-xs font-semibold text-[#3b2a1e]">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) =>
                          void handleUploadBrandLogo(
                            event.target.files?.[0] ?? null,
                          )
                        }
                        disabled={brandLogoUploading}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBrandLogo()}
                      disabled={brandLogoUploading}
                      className="rounded-full border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-xs font-semibold text-[#c24d34] disabled:opacity-60"
                    >
                      Remove Logo
                    </button>
                  </div>
                  {brandLogoMessage && (
                    <p className="mt-2 text-xs text-[#3b2a1e]">
                      {brandLogoMessage}
                    </p>
                  )}
                </div>
              </div>
              {/* View User Activity Logs */}
              <form
                onSubmit={handleViewLogs}
                className="flex flex-wrap items-end gap-2 mt-4"
              >
                <label className="flex flex-col text-sm">
                  User Email for Logs
                  <input
                    type="email"
                    value={logsEmail}
                    onChange={(e) => setLogsEmail(e.target.value)}
                    className="rounded-xl border border-[#e6d6c6] px-2 py-1 mt-1"
                    placeholder="Enter user email"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-[#1f1a16] px-4 py-2 text-sm font-semibold text-white"
                  disabled={logsLoading}
                >
                  {logsLoading ? "Loading..." : "View Activity Logs"}
                </button>
              </form>
              {logsError && (
                <div className="mt-2 text-red-600">{logsError}</div>
              )}
              {logs && (
                <div className="mt-2 max-h-64 overflow-y-auto border rounded-xl border-[#e6d6c6] bg-[#faf6f0] p-2 text-xs">
                  {logs.length === 0 ? (
                    <div>No activity logs found.</div>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 text-left">Date</th>
                          <th className="px-2 py-1 text-left">Action</th>
                          <th className="px-2 py-1 text-left">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log, i) => (
                          <tr
                            key={log.id || i}
                            className="border-b border-[#e6d6c6]"
                          >
                            <td className="px-2 py-1">
                              {log.createdAt
                                ? new Date(log.createdAt).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-2 py-1">{log.action || "-"}</td>
                            <td className="px-2 py-1">{log.details || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">
                Troubleshooting
              </h2>
              <ul className="list-disc ml-6 space-y-2">
                <li>Check System Health (coming soon)</li>
                <li>Run Diagnostics (coming soon)</li>
                <li>Clear Cache (coming soon)</li>
              </ul>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1f1a16] mb-2">
                Support Operations
              </h2>
              <ul className="list-disc ml-6 space-y-2">
                <li>View Open Support Tickets (coming soon)</li>
                <li>Assign Ticket to Agent (coming soon)</li>
                <li>Close Ticket (coming soon)</li>
              </ul>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
