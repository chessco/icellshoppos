import { FormEvent, useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

const WHATSAPP_CODES = ["+52", "+1"];
const PERMISSION_KEYS = [
  "canDeleteInventory",
  "canEditInventoryPrices",
  "canEditPricingRules",
  "canEditLabelTemplate",
  "canManageOrgSettings",
  "canCreateSales",
  "canCancelSales",
  "canImportInventoryUpdates",
  "canManageRepairs",
  "canManageTeam",
] as const;

const PERMISSION_LABELS: Record<(typeof PERMISSION_KEYS)[number], string> = {
  canDeleteInventory: "Delete inventory",
  canEditInventoryPrices: "Edit inventory prices",
  canEditPricingRules: "Edit pricing rules",
  canEditLabelTemplate: "Edit label templates",
  canManageOrgSettings: "Manage org settings/logo",
  canCreateSales: "Create sales",
  canCancelSales: "Cancel sales",
  canImportInventoryUpdates: "Import inventory updates",
  canManageRepairs: "Manage repairs",
  canManageTeam: "Manage team/invites",
};

const parseWhatsapp = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { code: "+52", number: "" };
  const matchedCode = WHATSAPP_CODES.find((code) => raw.startsWith(code));
  const code = matchedCode ?? "+52";
  const number = raw.replace(code, "").replace(/\D/g, "").slice(0, 10);
  return { code, number };
};

const roleDefaults = (role: "superadmin" | "admin" | "staff") => {
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
    } as Record<(typeof PERMISSION_KEYS)[number], boolean>;
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
  } as Record<(typeof PERMISSION_KEYS)[number], boolean>;
};

const mergePermissions = (
  role: "superadmin" | "admin" | "staff",
  overrides?: Record<string, boolean> | null
) => {
  const base = roleDefaults(role);
  for (const key of PERMISSION_KEYS) {
    if (typeof overrides?.[key] === "boolean") {
      base[key] = Boolean(overrides[key]);
    }
  }
  return base;
};

export function DesktopProfile({ baseUrl, signedIn }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<DesktopProfilePayload | null>(null);
  const [summary, setSummary] = useState<{ organization?: { subscriptions?: Array<{ status?: string; trialEndsAt?: string | null; currentPeriodEnd?: string | null; plan?: { name?: string } | null }> } } | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");

  const [members, setMembers] = useState<DesktopTeamMember[]>([]);
  const [invites, setInvites] = useState<DesktopTeamInvite[]>([]);

  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [whatsappCode, setWhatsappCode] = useState("+52");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff">("staff");
  const [invitePermissions, setInvitePermissions] = useState(roleDefaults("staff"));

  const roleLabel = useMemo(() => {
    const role = profile?.role ?? "";
    return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : "-";
  }, [profile?.role]);

  const subscriptionLine = useMemo(() => {
    const sub = summary?.organization?.subscriptions?.[0];
    if (!sub) return { plan: "-", status: "-", renews: "-" };
    const renewDate = sub.trialEndsAt ?? sub.currentPeriodEnd ?? "";
    return {
      plan: sub.plan?.name ?? "-",
      status: sub.status ?? "-",
      renews: renewDate ? new Date(renewDate).toLocaleDateString("en-US") : "-",
    };
  }, [summary]);

  const canManageTeam = profile?.role === "admin" || profile?.role === "superadmin";

  const loadProfile = async () => {
    if (!signedIn) {
      setError("Sign in to access Profile.");
      setLoading(false);
      return;
    }

    if (!window.desktop?.profile?.get) {
      setError("Desktop bridge is outdated. Restart the app to load Profile support.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [profileData, summaryData, logoData] = await Promise.all([
        window.desktop.profile.get({ baseUrl }),
        window.desktop.profile.summary({ baseUrl }).catch(() => null),
        window.desktop.org.logoDataUrl({ baseUrl }).catch(() => ({ logoDataUrl: "" })),
      ]);

      setProfile(profileData);
      setSummary(summaryData);
      setLogoDataUrl(logoData.logoDataUrl ?? "");

      setFullName(profileData.user?.fullName ?? "");
      setLanguage(profileData.user?.preferredLanguage === "es" ? "es" : "en");
      const parsed = parseWhatsapp(profileData.user?.whatsapp ?? "");
      setWhatsappCode(parsed.code);
      setWhatsappNumber(parsed.number);

      if (profileData.role === "admin" || profileData.role === "superadmin") {
        const [membersData, invitesData] = await Promise.all([
          window.desktop.profile.teamMembers({ baseUrl }).catch(() => ({ members: [] })),
          window.desktop.profile.invites({ baseUrl }).catch(() => ({ invites: [] })),
        ]);
        setMembers(membersData.members ?? []);
        setInvites(invitesData.invites ?? []);
      } else {
        setMembers([]);
        setInvites([]);
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, [baseUrl, signedIn]);

  useEffect(() => {
    setInvitePermissions(roleDefaults(inviteRole));
  }, [inviteRole]);

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.desktop?.profile?.update) return;

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    if (whatsappNumber.replace(/\D/g, "").length !== 10) {
      setError("WhatsApp number must have 10 digits.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await window.desktop.profile.update({
        baseUrl,
        data: {
          fullName: fullName.trim(),
          whatsappCountryCode: whatsappCode,
          whatsappNumber: whatsappNumber.replace(/\D/g, ""),
          preferredLanguage: language,
        },
      });

      if (profile) {
        setProfile({ ...profile, user: response.user });
      }
      setStatus("Profile updated.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.desktop?.profile?.changePassword) return;

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      await window.desktop.profile.changePassword({
        baseUrl,
        data: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Password changed successfully.");
    } catch (pwError: unknown) {
      setError(pwError instanceof Error ? pwError.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !window.desktop?.profile?.uploadLogo) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      setSaving(true);
      setError("");
      setStatus("");
      try {
        await window.desktop.profile.uploadLogo({
          baseUrl,
          data: {
            fileName: file.name,
            mimeType: file.type,
            base64,
          },
        });
        const logo = await window.desktop.org.logoDataUrl({ baseUrl });
        setLogoDataUrl(logo.logoDataUrl ?? "");
        setStatus("Logo uploaded successfully.");
      } catch (logoError: unknown) {
        setError(logoError instanceof Error ? logoError.message : "Failed to upload logo.");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteLogo = async () => {
    if (!window.desktop?.profile?.deleteLogo) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await window.desktop.profile.deleteLogo({ baseUrl });
      setLogoDataUrl("");
      setStatus("Logo removed.");
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove logo.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!window.desktop?.profile?.sendInvite) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setError("Invite email is required.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await window.desktop.profile.sendInvite({
        baseUrl,
        data: {
          email,
          role: inviteRole,
          permissions: invitePermissions,
        },
      });
      setInviteEmail("");
      setStatus(response.warning ?? "Invite sent successfully.");
      const invitesData = await window.desktop.profile.invites({ baseUrl });
      setInvites(invitesData.invites ?? []);
    } catch (inviteError: unknown) {
      setError(inviteError instanceof Error ? inviteError.message : "Failed to send invite.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.desktop?.profile?.revokeInvite) return;
    setSaving(true);
    setError("");
    try {
      await window.desktop.profile.revokeInvite({ baseUrl, data: { inviteId } });
      const invitesData = await window.desktop.profile.invites({ baseUrl });
      setInvites(invitesData.invites ?? []);
      setStatus("Invite revoked.");
    } catch (revokeError: unknown) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke invite.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMember = async (
    memberId: string,
    role: "superadmin" | "admin" | "staff",
    permissions: Record<string, boolean>
  ) => {
    if (!window.desktop?.profile?.updateTeamMember) return;
    setSaving(true);
    setError("");
    try {
      await window.desktop.profile.updateTeamMember({
        baseUrl,
        data: { membershipId: memberId, role, permissions },
      });
      const membersData = await window.desktop.profile.teamMembers({ baseUrl });
      setMembers(membersData.members ?? []);
      setStatus("Member access updated.");
    } catch (memberError: unknown) {
      setError(memberError instanceof Error ? memberError.message : "Failed to update member.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-shell">
      <section className="profile-header">
        <div>
          <h2>Profile</h2>
          <p>Manage profile, team access, subscription, password, and logo.</p>
        </div>
        <div className="profile-header__actions">
          <button type="button" onClick={() => void loadProfile()} disabled={loading || saving}>Refresh</button>
        </div>
      </section>

      {loading ? <p className="hint">Loading profile...</p> : null}

      {!loading ? (
        <section className="profile-grid">
          <article className="profile-card">
            <h3>Account</h3>
            <form onSubmit={handleSaveProfile} className="profile-form">
              <label>
                Full Name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>

              <label>
                WhatsApp
                <div className="profile-whatsapp-row">
                  <select value={whatsappCode} onChange={(event) => setWhatsappCode(event.target.value)}>
                    {WHATSAPP_CODES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                  <input
                    value={whatsappNumber}
                    onChange={(event) => setWhatsappNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10 digits"
                  />
                </div>
              </label>

              <label>
                Language
                <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "es") }>
                  <option value="en">English</option>
                  <option value="es">Espanol</option>
                </select>
              </label>

              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
            </form>
          </article>

          <article className="profile-card">
            <h3>Workspace</h3>
            <div className="profile-kv"><span>Email</span><strong>{profile?.user?.email ?? "-"}</strong></div>
            <div className="profile-kv"><span>Status</span><strong>{profile?.user?.status ?? "-"}</strong></div>
            <div className="profile-kv"><span>Role</span><strong>{roleLabel}</strong></div>
            <div className="profile-kv"><span>Organization</span><strong>{profile?.organization?.name ?? "-"}</strong></div>
            <div className="profile-kv"><span>Workspace ID</span><strong>{profile?.organization?.id ?? "-"}</strong></div>
            <div className="profile-kv"><span>Slug</span><strong>{profile?.organization?.slug ?? "-"}</strong></div>
          </article>
        </section>
      ) : null}

      {!loading ? (
        <section className="profile-grid">
          <article className="profile-card profile-password-card">
            <h3>Password</h3>
            <form onSubmit={handleChangePassword} className="profile-form">
              <label>
                Current Password
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </label>
              <label>
                New Password
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <label>
                Confirm New Password
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Update Password"}</button>
            </form>
          </article>

          <article className="profile-card">
            <h3>Logo</h3>
            <div className="profile-logo-wrap">
              {logoDataUrl ? <img src={logoDataUrl} alt="Organization logo" className="profile-logo-preview" /> : <p className="hint">No logo uploaded.</p>}
            </div>
            <div className="profile-logo-actions">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
              <button type="button" onClick={() => void handleDeleteLogo()} disabled={saving || !logoDataUrl}>Remove Logo</button>
            </div>
          </article>

          <article className="profile-card">
            <h3>Subscription</h3>
            <div className="profile-kv"><span>Plan</span><strong>{subscriptionLine.plan}</strong></div>
            <div className="profile-kv"><span>Status</span><strong>{subscriptionLine.status}</strong></div>
            <div className="profile-kv"><span>Renews / Trial Ends</span><strong>{subscriptionLine.renews}</strong></div>
          </article>
        </section>
      ) : null}

      {canManageTeam ? (
        <section className="profile-card">
          <h3>Team Access</h3>

          <div className="profile-team-section">
            <h4>Invite employee</h4>
            <div className="profile-team-invite-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="employee@email.com"
              />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "staff")}>
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
              <button type="button" onClick={() => void handleSendInvite()} disabled={saving}>Send invite</button>
            </div>
            <div className="profile-permissions-grid">
              {PERMISSION_KEYS.map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={invitePermissions[key]}
                    onChange={(event) =>
                      setInvitePermissions((prev) => ({
                        ...prev,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  <span>{PERMISSION_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="profile-team-section">
            <h4>Pending invites</h4>
            <div className="profile-team-list">
              {invites.filter((invite) => invite.status === "pending").map((invite) => (
                <div key={invite.id} className="profile-team-row">
                  <div>
                    <div>{invite.email}</div>
                    <small>{invite.role} · expires {new Date(invite.expiresAt).toLocaleString()}</small>
                  </div>
                  <button type="button" onClick={() => void handleRevokeInvite(invite.id)} disabled={saving}>Revoke</button>
                </div>
              ))}
              {invites.filter((invite) => invite.status === "pending").length === 0 ? (
                <p className="hint">No pending invites.</p>
              ) : null}
            </div>
          </div>

          <div className="profile-team-section">
            <h4>Team members</h4>
            <div className="profile-team-list">
              {members.map((member) => {
                const merged = mergePermissions(member.role, member.permissionsJson as Record<string, boolean> | null | undefined);
                const roleState = { value: member.role };
                const permissionState = { ...merged };

                return (
                  <form
                    key={member.id}
                    className="profile-member-card"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleUpdateMember(member.id, roleState.value, permissionState);
                    }}
                  >
                    <div className="profile-member-head">
                      <div>
                        <div>{member.user.fullName || member.user.email}</div>
                        <small>{member.user.email} · {member.user.status}</small>
                      </div>
                      <select
                        defaultValue={member.role}
                        onChange={(event) => {
                          roleState.value = event.target.value as "superadmin" | "admin" | "staff";
                        }}
                      >
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    </div>

                    <div className="profile-permissions-grid">
                      {PERMISSION_KEYS.map((key) => (
                        <label key={`${member.id}-${key}`}>
                          <input
                            type="checkbox"
                            defaultChecked={merged[key]}
                            onChange={(event) => {
                              permissionState[key] = event.target.checked;
                            }}
                          />
                          <span>{PERMISSION_LABELS[key]}</span>
                        </label>
                      ))}
                    </div>

                    <button type="submit" disabled={saving}>Save member access</button>
                  </form>
                );
              })}
              {members.length === 0 ? <p className="hint">No members found.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
