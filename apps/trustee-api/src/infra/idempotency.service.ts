import { Injectable } from '@nestjs/common';
import { sha256Hex } from '@trustee/cryptography';
import { PrismaService } from './prisma.service';

export interface IdempotentResult<T> {
  replayed: boolean;
  value: T;
}

/**
 * Idempotency for value-changing APIs (§27: "All value-changing APIs must
 * support idempotency"). Callers pass an idempotency key and the request body;
 * a repeated key with the same body replays the stored response, while the same
 * key with a different body is rejected as a conflict.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    key: string | undefined,
    route: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    if (!key) {
      return { replayed: false, value: await fn() };
    }
    const requestHash = sha256Hex(stableStringify(body));
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(key);
      }
      return { replayed: true, value: existing.responseBody as T };
    }
    const value = await fn();
    await this.prisma.idempotencyKey.create({
      data: {
        key,
        route,
        requestHash,
        responseCode: 200,
        responseBody: JSON.parse(
          JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        ),
      },
    });
    return { replayed: false, value };
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" was reused with a different request body`);
    this.name = 'IdempotencyConflictError';
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
