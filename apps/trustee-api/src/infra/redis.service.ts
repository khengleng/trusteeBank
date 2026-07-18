import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Optional Redis connection (Railway Redis via REDIS_URL). Used for distributed
 * rate limiting and usage counters so limits are correct across API replicas
 * (update §3 "separate rate limits", §25 reliability). When REDIS_URL is unset,
 * `client` is null and callers fall back to per-replica in-memory state.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      this.logger.warn('REDIS_URL not set — rate limiting falls back to in-memory (per-replica).');
      return;
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  get available(): boolean {
    return this.client !== null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }
}
