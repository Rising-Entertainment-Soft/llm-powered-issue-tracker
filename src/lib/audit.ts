import { prisma } from "./prisma";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_USER"
  | "CREATE_TICKET"
  | "UPDATE_TICKET"
  | "DELETE_TICKET"
  | "EXTRACT";

export interface AuditParams {
  userId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: unknown;
}

export async function recordAudit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        details:
          params.details === undefined
            ? null
            : typeof params.details === "string"
              ? params.details
              : JSON.stringify(params.details),
      },
    });
  } catch (e) {
    // Audit logging must never crash the main request
    console.error("[audit] failed to record", e);
  }
}
