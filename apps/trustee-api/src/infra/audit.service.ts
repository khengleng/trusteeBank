import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface AuditRecord {
  actor: string;
  actorRole?: string;
  action: string;
  subjectType: string;
  subjectId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
  approvalRef?: string;
  correlationId?: string;
  ip?: string;
  device?: string;
}

/**
 * Append-only audit trail (§34). Records are never updated or deleted; this
 * service exposes only a write. Sensitive fields (full account numbers, secrets,
 * KYC) must be redacted by callers before reaching here (§37).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: entry.actor,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId ?? null,
        beforeState: toJson(entry.beforeState),
        afterState: toJson(entry.afterState),
        reason: entry.reason ?? null,
        approvalRef: entry.approvalRef ?? null,
        correlationId: entry.correlationId ?? null,
        ip: entry.ip ?? null,
        device: entry.device ?? null,
        sourceSystem: 'trustee-api',
      },
    });
  }
}

function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  // BigInt is not JSON-serializable by Prisma's Json type; stringify safely.
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as object;
}
