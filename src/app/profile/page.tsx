"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { useLocale, useT } from "@/components/LocaleProvider";
import {
  WHATSAPP_COUNTRY_CODES,
  normalizeWhatsappDigits,
  parseWhatsappNumber,
} from "@/lib/whatsapp";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n/config";

type UserProfile = {
  id: string;
  email: string;
  fullName: string | null;
  whatsapp: string | null;
  preferredLanguage: AppLocale;
  createdAt: string;
  status: string;
};

type OrgData = {
  id: string;
  name: string;
  slug: string;
} | null;

type SubscriptionData = {
  id?: string;
  planId?: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: { id?: string; name: string; code?: string; basePriceCents: number } | null;
} | null;

type PermissionKey =
  | "canDeleteInventory"
  | "canEditInventoryPrices"
  | "canEditPricingRules"
  | "canEditLabelTemplate"
  | "canManageOrgSettings"
  | "canCreateSales"
  | "canCancelSales"
  | "canImportInventoryUpdates"
  | "canManageRepairs"
  | "canManageTeam"
  | "canManageCommissions"
  | "canViewCostAndMargin";

type PermissionMap = Record<PermissionKey, boolean>;

type TeamMember = {
  id: string;
  role: "superadmin" | "admin" | "staff";
  permissionsJson?: Partial<PermissionMap> | null;
  userId: string;
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    status: string;
  };
};

type TeamInvite = {
  id: string;
  email: string;
  role: "superadmin" | "admin" | "staff";
  permissionsJson?: Partial<PermissionMap> | null;
  status: string;
  expiresAt: string;
};

const PERMISSION_LABELS: Array<{ key: PermissionKey; label: string }> = [
  { key: "canDeleteInventory", label: "Delete inventory" },
  { key: "canEditInventoryPrices", label: "Edit inventory prices" },
  { key: "canEditPricingRules", label: "Edit pricing rules" },
  { key: "canEditLabelTemplate", label: "Edit label templates" },
  { key: "canManageOrgSettings", label: "Manage org settings/logo" },
  { key: "canCreateSales", label: "Create sales" },
  { key: "canCancelSales", label: "Cancel sales" },
  { key: "canImportInventoryUpdates", label: "Import inventory updates" },
  { key: "canManageRepairs", label: "Manage repairs" },
  { key: "canManageTeam", label: "Manage team/invites" },
  { key: "canManageCommissions", label: "Manage sales commissions" },
  { key: "canViewCostAndMargin", label: "View inventory cost and sales margin" },
];

const defaultPermissionsByRole = (role: TeamMember["role"]): PermissionMap => {
  if (role === "superadmin" || role === "admin") {
    return {
      canDeleteInventory: true,
      canEditInventoryPrices: true,
      canEditPricingRules: true,
      canEditLabelTemplate: true,
      canManageOrgSettings: true,
      canCreateSales: true,
      canCancelSales: true,
      canImportInventoryUpdates: true,
      canManageRepairs: true,
      canManageTeam: true,
      canManageCommissions: true,
      canViewCostAndMargin: true,
    };
  }

  return {
    canDeleteInventory: false,
    canEditInventoryPrices: false,
    canEditPricingRules: false,
    canEditLabelTemplate: false,
    canManageOrgSettings: false,
    canCreateSales: true,
    canCancelSales: false,
    canImportInventoryUpdates: false,
    canManageRepairs: false,
    canManageTeam: false,
    canManageCommissions: false,
    canViewCostAndMargin: false,
  };
};

const mergePermissions = (
  role: TeamMember["role"],
  overrides?: Partial<PermissionMap> | null
): PermissionMap => {
  const base = defaultPermissionsByRole(role);
  if (!overrides) return base;

  const merged: PermissionMap = { ...base };
  for (const { key } of PERMISSION_LABELS) {
    const value = overrides[key];
    if (typeof value === "boolean") {
      merged[key] = value;
    }
  }
  return merged;
};

export default function ProfilePage() {
  const { setLocale } = useLocale();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<OrgData>(null);
  const [role, setRole] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData>(null);
  const [loading, setLoading] = useState(true);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileWhatsappCountryCode, setProfileWhatsappCountryCode] = useState<(typeof WHATSAPP_COUNTRY_CODES)[number]>("+52");
  const [profileWhatsappNumber, setProfileWhatsappNumber] = useState("");
  const [profileLanguage, setProfileLanguage] = useState<AppLocale>("en");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Change password state
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Logout state
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");
  const [invitePermissions, setInvitePermissions] = useState<PermissionMap>(
    defaultPermissionsByRole("staff")
  );
  const [teamMessage, setTeamMessage] = useState("");

  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [showPlanUpgradeModal, setShowPlanUpgradeModal] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<
    Array<{ id: string; name: string; code: string; basePriceCents: number; trialDays: number }>
  >([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"active" | "trialing">("active");
  const [upgradingPlan, setUpgradingPlan] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/user-profile").then((r) => {
        if (r.status === 401) { router.replace("/login"); return null; }
        return r.json();
      }),
      fetch("/api/org/summary").then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([profileData, orgData]) => {
        if (!profileData) return;
        setUser(profileData.user);
        setProfileFullName(profileData.user?.fullName ?? "");
        const parsedWhatsapp = parseWhatsappNumber(profileData.user?.whatsapp ?? "");
        setProfileWhatsappCountryCode(parsedWhatsapp.countryCode);
        setProfileWhatsappNumber(parsedWhatsapp.localNumber);
        const nextLanguage = profileData.user?.preferredLanguage === "es" ? "es" : "en";
        setProfileLanguage(nextLanguage);
        setLocale(nextLanguage);
        setOrganization(profileData.organization ?? null);
        setRole(profileData.role ?? null);
        setIsSuperadmin(Boolean(profileData.isSuperadmin || profileData.role === "superadmin"));
        const sub = orgData?.organization?.subscriptions?.[0] ?? null;
        setSubscription(sub);
      })
      .finally(() => setLoading(false));
  }, [router, setLocale]);

  const handleOpenPlanUpgrade = async () => {
    setShowPlanUpgradeModal(true);
    setUpgradeMessage("");
    try {
      const res = await fetch("/api/org/plans");
      if (res.ok) {
        const data = await res.json();
        const plans = data.plans || [];
        setAvailablePlans(plans);
        if (plans.length > 0) {
          const currentPlanId = subscription?.plan?.id || plans[0].id;
          setSelectedPlanId(currentPlanId);
        }
      }
    } catch (err) {
      console.error("Error loading plans:", err);
    }
  };

  const handleApplySuperadminUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !selectedPlanId) return;
    setUpgradingPlan(true);
    setUpgradeMessage("");
    try {
      const res = await fetch("/api/admin/subscriptions/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          planId: selectedPlanId,
          status: selectedStatus,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubscription(data.subscription);
        setUpgradeMessage("¡Plan actualizado y ascendido exitosamente!");
        setTimeout(() => {
          setShowPlanUpgradeModal(false);
          setUpgradeMessage("");
        }, 1500);
      } else {
        setUpgradeMessage(data.error || "Error al actualizar plan");
      }
    } catch (err) {
      setUpgradeMessage("Error de conexión al ascender plan");
    } finally {
      setUpgradingPlan(false);
    }
  };

  useEffect(() => {
    if (!(role === "admin" || role === "superadmin")) return;

    const loadTeamData = async () => {
      setTeamLoading(true);
      try {
        const [membersResponse, invitesResponse] = await Promise.all([
          fetch("/api/org/team/members", { cache: "no-store" }),
          fetch("/api/org/invites", { cache: "no-store" }),
        ]);

        const membersPayload = await membersResponse.json().catch(() => ({}));
        const invitesPayload = await invitesResponse.json().catch(() => ({}));

        if (membersResponse.ok) {
          setTeamMembers((membersPayload?.members ?? []) as TeamMember[]);
        }

        if (invitesResponse.ok) {
          setTeamInvites((invitesPayload?.invites ?? []) as TeamInvite[]);
        }
      } finally {
        setTeamLoading(false);
      }
    };

    void loadTeamData();
  }, [role]);

  useEffect(() => {
    setInvitePermissions(defaultPermissionsByRole(inviteRole));
  }, [inviteRole]);

  const refreshTeamData = async () => {
    if (!(role === "admin" || role === "superadmin")) return;
    const [membersResponse, invitesResponse] = await Promise.all([
      fetch("/api/org/team/members", { cache: "no-store" }),
      fetch("/api/org/invites", { cache: "no-store" }),
    ]);

    const membersPayload = await membersResponse.json().catch(() => ({}));
    const invitesPayload = await invitesResponse.json().catch(() => ({}));

    if (membersResponse.ok) {
      setTeamMembers((membersPayload?.members ?? []) as TeamMember[]);
    }
    if (invitesResponse.ok) {
      setTeamInvites((invitesPayload?.invites ?? []) as TeamInvite[]);
    }
  };

  const handleSendInvite = async () => {
    setTeamMessage("");
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setTeamMessage("Invite email is required.");
      return;
    }

    setTeamLoading(true);
    try {
      const response = await fetch("/api/org/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          role: inviteRole,
          permissions: invitePermissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setTeamMessage(payload?.error ?? "Failed to send invite.");
        return;
      }

      setInviteEmail("");
      setTeamMessage(payload?.warning ?? "Invite sent successfully.");
      await refreshTeamData();
    } catch {
      setTeamMessage("Failed to send invite.");
    } finally {
      setTeamLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setTeamMessage("");
    setTeamLoading(true);
    try {
      const response = await fetch("/api/org/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTeamMessage(payload?.error ?? "Failed to revoke invite.");
        return;
      }

      setTeamMessage("Invite revoked.");
      await refreshTeamData();
    } catch {
      setTeamMessage("Failed to revoke invite.");
    } finally {
      setTeamLoading(false);
    }
  };

  const handleSaveMemberPermissions = async (
    member: TeamMember,
    nextRole: TeamMember["role"],
    nextPermissions: PermissionMap
  ) => {
    setTeamMessage("");
    setTeamLoading(true);
    try {
      const response = await fetch("/api/org/team/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: member.id,
          role: nextRole,
          permissions: nextPermissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTeamMessage(payload?.error ?? "Failed to update member.");
        return;
      }

      setTeamMessage("Member permissions updated.");
      await refreshTeamData();
    } catch {
      setTeamMessage("Failed to update member.");
    } finally {
      setTeamLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!profileFullName.trim()) {
      setProfileError("Full name and WhatsApp number are required.");
      return;
    }

    if (normalizeWhatsappDigits(profileWhatsappNumber).length !== 10) {
      setProfileError("Enter a valid 10-digit WhatsApp number.");
      return;
    }

    setProfileSaving(true);
    try {
      const response = await fetch("/api/auth/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profileFullName,
          whatsappCountryCode: profileWhatsappCountryCode,
          whatsappNumber: profileWhatsappNumber,
          preferredLanguage: profileLanguage,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setProfileError(data?.error ?? "Failed to update profile.");
        return;
      }

      setUser(data.user);
      setProfileFullName(data.user?.fullName ?? "");
      const parsedWhatsapp = parseWhatsappNumber(data.user?.whatsapp ?? "");
      setProfileWhatsappCountryCode(parsedWhatsapp.countryCode);
      setProfileWhatsappNumber(parsedWhatsapp.localNumber);
      const nextLanguage = data.user?.preferredLanguage === "es" ? "es" : "en";
      setProfileLanguage(nextLanguage);
      setLocale(nextLanguage);
      setProfileSuccess("Profile updated successfully.");
    } catch {
      setProfileError("Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUploadLogo = async (file: File | null) => {
    if (!file) return;
    setLogoUploading(true);
    setLogoMessage("");

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/org/logo", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLogoMessage(data?.error ?? "Failed to upload logo.");
        return;
      }

      setLogoVersion((v) => v + 1);
      setLogoMessage("Logo updated successfully.");
    } catch {
      setLogoMessage("Failed to upload logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    setLogoUploading(true);
    setLogoMessage("");

    try {
      const response = await fetch("/api/org/logo", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLogoMessage(data?.error ?? "Failed to remove logo.");
        return;
      }

      setLogoVersion((v) => v + 1);
      setLogoMessage("Logo removed.");
    } catch {
      setLogoMessage("Failed to remove logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error ?? "Failed to change password.");
      } else {
        setPwSuccess("Password changed successfully.");
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
        setShowPwForm(false);
      }
    } catch {
      setPwError("Failed to change password.");
    } finally {
      setPwLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const roleLabel = (r: string | null) => {
    if (!r) return "";
    return r.charAt(0).toUpperCase() + r.slice(1);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#5f7298]">Loading profile</p>
      </div>
    );
  }

  const sub = subscription;
  const planName = sub?.plan?.name ?? "—";
  const subStatus = sub?.status ?? "—";
  const periodEnd = sub?.trialEndsAt
    ? new Date(sub.trialEndsAt)
    : sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd)
    : null;

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.92)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 text-sm font-semibold text-[#1f3563]">
          <span>My Profile</span>
          <Link
            href="/profile/user-manual"
            className="rounded-full border border-[#bfd4ff] bg-[#f3f8ff] px-3 py-1.5 text-xs font-semibold text-[#1f3563] transition hover:bg-[#eaf2ff] md:hidden"
          >
            {t("profile.userManual", "User Manual")}
          </Link>
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <div className="mx-auto w-full max-w-xl space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[#0f1f3d]">My Profile</h1>
                <p className="text-sm text-[#5f7298]">Your account and workspace details</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/profile/user-manual"
                  className="rounded-full border border-[#bfd4ff] bg-[#f3f8ff] px-4 py-2 text-sm font-semibold text-[#1f3563] transition hover:bg-[#eaf2ff]"
                >
                  {t("profile.userManual", "User Manual")}
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="rounded-full border border-[#ffd9d1] bg-[#fff6f3] px-4 py-2 text-sm font-semibold text-[#c24d34] transition hover:bg-[#ffeae5] disabled:opacity-60"
                >
                  {logoutLoading ? "Signing out" : "Sign Out"}
                </button>
              </div>
            </div>

            {/* Account info card */}
            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Account</h2>
              <form onSubmit={handleSaveProfile} className="grid gap-4">
                <label className="grid gap-1.5 text-sm text-[#1f3563]">
                  Full Name
                  <input
                    value={profileFullName}
                    onChange={(event) => setProfileFullName(event.target.value)}
                    className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-[#1f3563]">
                  WhatsApp Number
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                      value={profileWhatsappCountryCode}
                      onChange={(event) =>
                        setProfileWhatsappCountryCode(
                          event.target.value as (typeof WHATSAPP_COUNTRY_CODES)[number]
                        )
                      }
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
                      value={profileWhatsappNumber}
                      onChange={(event) =>
                        setProfileWhatsappNumber(normalizeWhatsappDigits(event.target.value))
                      }
                      className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                      placeholder="10-digit number"
                      required
                    />
                  </div>
                </label>
                <label className="grid gap-1.5 text-sm text-[#1f3563]">
                  Language
                  <select
                    value={profileLanguage}
                    onChange={(event) => setProfileLanguage(event.target.value as AppLocale)}
                    className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                  >
                    {SUPPORTED_LOCALES.map((locale) => (
                      <option key={locale} value={locale}>
                        {locale === "es" ? "Español" : "English"}
                      </option>
                    ))}
                  </select>
                </label>
                {profileError && (
                  <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">{profileError}</p>
                )}
                {profileSuccess && (
                  <p className="rounded-xl border border-[#d1ffd9] bg-[#f3fff6] px-3 py-2 text-sm text-[#2a7c3b]">{profileSuccess}</p>
                )}
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-fit rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {profileSaving ? "Saving" : "Save Profile"}
                </button>
              </form>
              <dl className="mt-5 divide-y divide-[#eef4ff]">
                <InfoRow label="Email" value={user?.email ?? ""} />
                <InfoRow label="WhatsApp" value={user?.whatsapp ?? ""} />
                <InfoRow label="Language" value={profileLanguage === "es" ? "Español" : "English"} />
                <InfoRow label="Status" value={user?.status ?? ""} capitalize />
                <InfoRow label="Member Since" value={user ? formatDate(user.createdAt) : ""} />
              </dl>
            </section>

            {/* Workspace / org card */}
            {organization && (
              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Workspace</h2>
                <dl className="divide-y divide-[#eef4ff]">
                  <InfoRow label="Organization" value={organization.name} />
                  <InfoRow label="Workspace ID" value={organization.id} mono />
                  <InfoRow label="Slug" value={organization.slug} mono />
                  <InfoRow label="Your Role" value={roleLabel(role)} capitalize />
                </dl>
              </section>
            )}

            {(role === "admin" || role === "superadmin") && (
              <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Team Access</h2>

                <div className="grid gap-3 rounded-xl border border-[#e6edff] bg-[#f7fbff] p-4">
                  <div className="text-sm font-semibold text-[#1f3563]">Invite employee</div>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="employee@email.com"
                    className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                  />
                  <label className="grid gap-1 text-sm text-[#1f3563]">
                    Role
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as "admin" | "staff")}
                      className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2"
                    >
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>

                  <div className="grid gap-2">
                    {PERMISSION_LABELS.map((permission) => (
                      <label key={permission.key} className="flex items-center gap-2 text-sm text-[#1f3563]">
                        <input
                          type="checkbox"
                          checked={invitePermissions[permission.key]}
                          onChange={(event) =>
                            setInvitePermissions((previous) => ({
                              ...previous,
                              [permission.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{permission.label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleSendInvite}
                    disabled={teamLoading}
                    className="w-fit rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Send invite
                  </button>
                </div>

                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold text-[#1f3563]">Pending invites</h3>
                  <div className="grid gap-2">
                    {teamInvites.filter((invite) => invite.status === "pending").map((invite) => (
                      <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6edff] px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium text-[#1f3563]">{invite.email}</div>
                          <div className="text-xs text-[#5f7298]">{invite.role} · expires {new Date(invite.expiresAt).toLocaleString()}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRevokeInvite(invite.id)}
                          className="rounded-full border border-[#d6e4ff] px-3 py-1 text-xs font-semibold text-[#1f3563]"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                    {teamInvites.filter((invite) => invite.status === "pending").length === 0 && (
                      <p className="text-xs text-[#5f7298]">No pending invites.</p>
                    )}
                  </div>
                </div>

                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold text-[#1f3563]">Team members</h3>
                  <div className="grid gap-3">
                    {teamMembers.map((member) => {
                      const effective = mergePermissions(member.role, member.permissionsJson ?? {});

                      return (
                        <form
                          key={member.id}
                          className="rounded-xl border border-[#e6edff] p-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const nextRole = String(formData.get("role") ?? member.role) as TeamMember["role"];
                            const nextPermissions = PERMISSION_LABELS.reduce<PermissionMap>((acc, permission) => {
                              acc[permission.key] = formData.get(permission.key) === "on";
                              return acc;
                            }, { ...effective });
                            void handleSaveMemberPermissions(member, nextRole, nextPermissions);
                          }}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-[#1f3563]">{member.user.fullName || member.user.email}</div>
                              <div className="text-xs text-[#5f7298]">{member.user.email} · {member.user.status}</div>
                            </div>
                            <label className="text-sm text-[#1f3563]">
                              Role {" "}
                              <select
                                name="role"
                                defaultValue={member.role}
                                className="rounded-lg border border-[#bfd4ff] bg-white px-2 py-1 text-sm"
                              >
                                <option value="staff">staff</option>
                                <option value="admin">admin</option>
                                <option value="superadmin">superadmin</option>
                              </select>
                            </label>
                          </div>

                          <div className="grid gap-1">
                            {PERMISSION_LABELS.map((permission) => (
                              <label key={permission.key} className="flex items-center gap-2 text-sm text-[#1f3563]">
                                <input name={permission.key} type="checkbox" defaultChecked={effective[permission.key]} />
                                <span>{permission.label}</span>
                              </label>
                            ))}
                          </div>

                          <button
                            type="submit"
                            disabled={teamLoading}
                            className="mt-3 rounded-full border border-[#d6e4ff] px-3 py-1 text-xs font-semibold text-[#1f3563] disabled:opacity-60"
                          >
                            Save member access
                          </button>
                        </form>
                      );
                    })}
                    {teamMembers.length === 0 && <p className="text-xs text-[#5f7298]">No members found.</p>}
                  </div>
                </div>

                {teamMessage && (
                  <p className="mt-4 rounded-xl border border-[#d6e4ff] bg-[#f7fbff] px-3 py-2 text-sm text-[#1f3563]">{teamMessage}</p>
                )}
              </section>
            )}

            {/* Subscription / Plan card */}
            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Subscription</h2>
                  {isSuperadmin && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase shadow-xs">
                      👑 Superadmin
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isSuperadmin && (
                    <button
                      type="button"
                      onClick={handleOpenPlanUpgrade}
                      className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:brightness-105"
                    >
                      ⚡ Modificar Plan
                    </button>
                  )}
                  <Link
                    href="/billing"
                    className="rounded-full bg-[#2563eb] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1d4ed8]"
                  >
                    Manage Billing
                  </Link>
                </div>
              </div>

              {/* Superadmin Upgrade Modal / Inline Panel */}
              {isSuperadmin && showPlanUpgradeModal && (
                <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <h3 className="text-sm font-bold text-amber-950">
                        Ascender Plan de Organización (Superadmin Override)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlanUpgradeModal(false)}
                      className="text-xs text-amber-800 hover:text-amber-950 font-bold px-2 py-1 rounded-md"
                    >
                      ✕ Cerrar
                    </button>
                  </div>
                  <p className="text-xs text-amber-800/90 mb-4">
                    Como Superadmin, puedes cambiar de inmediato el plan de esta organización sin pasar por la pasarela de Stripe.
                  </p>

                  <form onSubmit={handleApplySuperadminUpgrade} className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">
                        Seleccionar Plan Destino
                      </label>
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-[#1f3563] outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={upgradingPlan}
                      >
                        {availablePlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code}) - ${(p.basePriceCents / 100).toFixed(2)}/mes
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-amber-900 mb-1">
                        Estado de Suscripción
                      </label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value as "active" | "trialing")}
                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-[#1f3563] outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={upgradingPlan}
                      >
                        <option value="active">Activo (Full Access / Pago Válido)</option>
                        <option value="trialing">Trialing (Periodo de Prueba)</option>
                      </select>
                    </div>

                    {upgradeMessage && (
                      <div className="sm:col-span-2 text-xs font-medium text-amber-900 bg-amber-100/80 p-2.5 rounded-lg border border-amber-300">
                        {upgradeMessage}
                      </div>
                    )}

                    <div className="sm:col-span-2 flex items-center justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowPlanUpgradeModal(false)}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        disabled={upgradingPlan}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={upgradingPlan}
                        className="rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        {upgradingPlan ? "Aplicando..." : "Confirmar y Ascender"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <dl className="divide-y divide-[#eef4ff]">
                <InfoRow label="Plan" value={planName} />
                <InfoRow label="Status" value={subStatus} capitalize />
                {periodEnd && (
                  <InfoRow
                    label={subStatus === "trialing" ? "Trial Ends" : "Renews"}
                    value={periodEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  />
                )}
              </dl>
              {(!sub || subStatus === "trialing") && (
                <div className="mt-4">
                  <Link
                    href="/billing"
                    className="block w-full rounded-xl bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:from-[#1d4ed8] hover:to-[#0284c7]"
                  >
                    View Plans &amp; Upgrade
                  </Link>
                </div>
              )}
            </section>

            {/* Change password */}
            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Password</h2>
                <button
                  onClick={() => { setShowPwForm((v) => !v); setPwError(""); setPwSuccess(""); }}
                  className="rounded-full border border-[#bfd4ff] px-4 py-1.5 text-xs font-semibold text-[#1f3563] transition hover:bg-[#eef5ff]"
                >
                  {showPwForm ? "Cancel" : "Change Password"}
                </button>
              </div>

              {pwSuccess && !showPwForm && (
                <p className="mt-3 rounded-xl border border-[#d1ffd9] bg-[#f3fff6] px-3 py-2 text-sm text-[#2a7c3b]">{pwSuccess}</p>
              )}

              {showPwForm && (
                <form onSubmit={handleChangePassword} className="mt-4 grid gap-3">
                  <label className="grid gap-1.5 text-sm text-[#1f3563]">
                    Current Password
                    <input
                      type="password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                      required
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-[#1f3563]">
                    New Password
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                      required
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm text-[#1f3563]">
                    Confirm New Password
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="rounded-xl border border-[#bfd4ff] bg-[#f7fbff] px-3 py-2 outline-none focus:border-[#2563eb]"
                      required
                    />
                  </label>
                  {pwError && (
                    <p className="rounded-xl border border-[#ffd9d1] bg-[#fff6f3] px-3 py-2 text-sm text-[#c24d34]">{pwError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="rounded-full bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                  >
                    {pwLoading ? "Saving" : "Save New Password"}
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-2xl border border-[#d6e4ff] bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#4b6292]">Brand Logo</h2>
              <p className="mt-2 text-sm text-[#5f7298]">Used on labels, receipts, and public inventory header. PNG, JPG, or WEBP up to 1MB.</p>

              <div className="mt-4 rounded-xl border border-[#eef4ff] bg-[#f7fbff] p-4">
                <img
                  src={`/api/org/logo?v=${logoVersion}`}
                  alt="Organization logo"
                  className="h-20 w-auto max-w-full object-contain"
                  onError={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                  onLoad={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = "block";
                  }}
                />
                <p className="mt-2 text-xs text-[#5f7298]">If no image appears, no logo is currently set.</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="rounded-full border border-[#bfd4ff] px-4 py-2 text-xs font-semibold text-[#1f3563] hover:bg-[#eef5ff] cursor-pointer">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleUploadLogo(e.target.files?.[0] ?? null)}
                    disabled={logoUploading}
                  />
                </label>
                <button
                  onClick={handleDeleteLogo}
                  disabled={logoUploading}
                  className="rounded-full border border-[#ffd9d1] bg-[#fff6f3] px-4 py-2 text-xs font-semibold text-[#c24d34] transition hover:bg-[#ffeae5] disabled:opacity-60"
                >
                  Remove Logo
                </button>
              </div>
              {logoMessage && (
                <p className="mt-3 text-sm text-[#1f3563]">{logoMessage}</p>
              )}
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  capitalize = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-[#5f7298]">{label}</dt>
      <dd
        className={[
          "text-right text-sm font-medium text-[#0f1f3d] break-all",
          mono ? "font-mono text-xs tracking-tight" : "",
          capitalize ? "capitalize" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
