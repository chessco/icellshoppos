import { prisma } from "./prisma";

interface AuditLogParams {
  organizationId?: string;
  actorUserId: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: any;
}

export async function logAudit({ organizationId, actorUserId, action, entity, entityId, meta }: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action,
      entity,
      entityId,
      meta,
    },
  });
}
