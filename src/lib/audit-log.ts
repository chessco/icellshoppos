import { prisma } from "./prisma";

interface AuditLogParams {
  actorUserId: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: any;
}

export async function logAudit({ actorUserId, action, entity, entityId, meta }: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entity,
      entityId,
      meta,
    },
  });
}
