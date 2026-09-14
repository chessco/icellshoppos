import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getActiveMembership, requireSession } from "@/lib/server-auth";

export const ORG_PERMISSION_KEYS = [
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

export type OrgPermissionKey = (typeof ORG_PERMISSION_KEYS)[number];

export type OrgPermissions = Record<OrgPermissionKey, boolean>;

type OrgRole = "superadmin" | "admin" | "staff";

const DEFAULT_PERMISSIONS_BY_ROLE: Record<OrgRole, OrgPermissions> = {
  superadmin: {
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
  },
  admin: {
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
  },
  staff: {
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
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const resolveEffectivePermissions = (role: OrgRole, permissionsJson: unknown): OrgPermissions => {
  const defaults = DEFAULT_PERMISSIONS_BY_ROLE[role];
  if (!isPlainObject(permissionsJson)) {
    return { ...defaults };
  }

  const resolved: OrgPermissions = { ...defaults };
  for (const key of ORG_PERMISSION_KEYS) {
    const override = permissionsJson[key];
    if (typeof override === "boolean") {
      resolved[key] = override;
    }
  }

  return resolved;
};

export type RequestOrgAccess = {
  session: Awaited<ReturnType<typeof requireSession>>;
  organizationId: string;
  role: OrgRole;
  permissions: OrgPermissions;
  membershipId?: string;
};

export async function getRequestOrgAccess(request: NextRequest): Promise<RequestOrgAccess> {
  const session = await requireSession(request);
  const active = getActiveMembership(session);

  if (!active) {
    throw new Error("FORBIDDEN");
  }

  const organizationId = active.organizationId;

  if (session.isSuperadmin) {
    return {
      session,
      organizationId,
      role: "superadmin",
      permissions: { ...DEFAULT_PERMISSIONS_BY_ROLE.superadmin },
    };
  }

  const membership = await (db.membership as unknown as {
    findUnique: (args: unknown) => Promise<
      | {
          id: string;
          role: OrgRole;
          permissionsJson: unknown;
        }
      | null
    >;
  }).findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.userId,
      },
    },
    select: {
      id: true,
      role: true,
      permissionsJson: true,
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const role = membership.role as OrgRole;
  const permissions = resolveEffectivePermissions(role, membership.permissionsJson);

  return {
    session,
    organizationId,
    role,
    permissions,
    membershipId: membership.id,
  };
}

export const emptyPermissionOverrides = (): Partial<OrgPermissions> => ({});
