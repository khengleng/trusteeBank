import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ClockService } from './clock.service';

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Per-client fixed-window rate limiting and usage counters (update §3 separate
 * rate limits). Backed by Redis so counts are shared across API replicas; falls
 * back to per-replica in-memory counters when Redis is unavailable. The window
 * is one minute; usage is also aggregated per hour for the admin dashboard.
 */
@Injectable()
export class RateLimitService {
  private readonly mem = new Map<string, { count: number; resetMs: number }>();

  constructor(
    private readonly redis: RedisService,
    private readonly clock: ClockService,
  ) {}

  /** Consume one unit for `clientId` against `limitPerMin`. */
  async consume(clientId: string, limitPerMin: number): Promise<RateDecision> {
    const nowMs = this.clock.now().getTime();
    const minute = Math.floor(nowMs / 60000);
    const resetSeconds = 60 - Math.floor((nowMs % 60000) / 1000);
    const rlKey = `rl:${clientId}:${minute}`;
    const usageKey = `usage:${clientId}:${Math.floor(nowMs / 3_600_000)}`;

    let count: number;
    if (this.redis.available && this.redis.client) {
      const c = this.redis.client;
      count = await c.incr(rlKey);
      if (count === 1) await c.expire(rlKey, 65);
      // Usage counter (best-effort; own key TTL ~26h).
      void c.incr(usageKey).then((u) => (u === 1 ? c.expire(usageKey, 93_600) : undefined));
    } else {
      const entry = this.mem.get(rlKey);
      if (!entry || entry.resetMs < nowMs) {
        this.mem.set(rlKey, { count: 1, resetMs: nowMs + resetSeconds * 1000 });
        count = 1;
      } else {
        entry.count += 1;
        count = entry.count;
      }
    }
    const remaining = Math.max(0, limitPerMin - count);
    return { allowed: count <= limitPerMin, limit: limitPerMin, remaining, resetSeconds };
  }

  /** Hourly usage counts for a client over the last `hours` (for the dashboard). */
  async usage(clientId: string, hours = 24): Promise<Array<{ hour: string; count: number }>> {
    if (!this.redis.available || !this.redis.client) return [];
    const nowHour = Math.floor(this.clock.now().getTime() / 3_600_000);
    const keys: string[] = [];
    for (let i = hours - 1; i >= 0; i--) keys.push(`usage:${clientId}:${nowHour - i}`);
    const values = await this.redis.client.mget(keys);
    return keys.map((_k, i) => ({
      hour: new Date((nowHour - (hours - 1 - i)) * 3_600_000).toISOString().slice(0, 13) + ':00Z',
      count: Number(values[i] ?? 0),
    }));
  }
}
