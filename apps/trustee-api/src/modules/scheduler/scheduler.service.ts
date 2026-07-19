import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { NotificationService } from '../../infra/notification.service';
import { ClockService } from '../../infra/clock.service';
import { ReserveService } from '../reserve/reserve.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

/**
 * Operational scheduler (go-live requirement). Runs recurring trustee jobs that
 * were previously manual-only:
 *
 *  - **Proof-of-reserve**: signed reserve snapshot per active program on a fixed
 *    cadence, so PayChain always has fresh signed reserve evidence (§22).
 *  - **Reserve reconciliation**: eligible reserve vs circulating liability, with
 *    exceptions recorded (§24).
 *  - **Shortfall / stale-feed alerting**: emails the stakeholder inbox when a
 *    program is under-reserved or its PayChain liability feed goes stale (§30).
 *  - **Webhook dead-letter alerting**: emails when outbox events exhaust retries.
 *
 * The API runs with multiple replicas, so every job is gated by a Redis lock
 * whose TTL equals the job's cadence — only one replica runs each cycle and the
 * lock's natural expiry paces the next run (a lightweight distributed cron). If
 * Redis is unavailable (dev), the job runs unguarded on the single replica.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  private readonly enabled = (process.env.SCHEDULER_ENABLED ?? 'true') !== 'false';
  private readonly tickMs = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);
  private readonly reserveCycleMs = Number(process.env.RESERVE_CYCLE_INTERVAL_MS ?? 3_600_000);
  private readonly deadLetterMs = Number(process.env.DEADLETTER_ALERT_INTERVAL_MS ?? 300_000);
  private readonly feedStaleSeconds = Number(process.env.FEED_STALE_SECONDS ?? 3_600);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notify: NotificationService,
    private readonly clock: ClockService,
    private readonly reserve: ReserveService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn('Scheduler disabled (SCHEDULER_ENABLED=false).');
      return;
    }
    this.logger.log(
      `Scheduler enabled: tick ${this.tickMs}ms · reserve-cycle ${this.reserveCycleMs}ms · ` +
        `dead-letter ${this.deadLetterMs}ms · feed-stale ${this.feedStaleSeconds}s`,
    );
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    // Do not keep the process alive solely for the scheduler.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One scheduler tick: attempt each due job under its own distributed lock. */
  private async tick(): Promise<void> {
    if (this.ticking) return; // never overlap ticks in a replica
    this.ticking = true;
    try {
      if (await this.acquire('reserve-cycle', this.reserveCycleMs)) {
        await this.runSafely('reserve-cycle', () => this.reserveCycle());
      }
      if (await this.acquire('deadletter-alert', this.deadLetterMs)) {
        await this.runSafely('deadletter-alert', () => this.deadLetterAlert());
      }
    } finally {
      this.ticking = false;
    }
  }

  private async runSafely(job: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Job "${job}" failed: ${(err as Error).message}`);
    }
  }

  /**
   * Acquire a job lock for `ttlMs` using Redis SET NX PX. Returns true if this
   * replica won the slot. The lock is intentionally NOT released on success — it
   * expires after `ttlMs`, which is what paces the job's cadence. When Redis is
   * unavailable we fall back to running every tick (single-replica dev only).
   */
  private async acquire(job: string, ttlMs: number): Promise<boolean> {
    const client = this.redis.client;
    if (!client) return true;
    const res = await client
      .set(`trustee:cron:${job}`, this.clock.nowIso(), 'PX', ttlMs, 'NX')
      .catch(() => null);
    return res === 'OK';
  }

  /** Proof-of-reserve + reconciliation + shortfall/stale-feed alerts. */
  private async reserveCycle(): Promise<void> {
    const programs = await this.prisma.program.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true },
    });
    if (programs.length === 0) {
      this.logger.log('reserve-cycle: no active programs.');
      return;
    }
    const alerts: string[] = [];
    for (const program of programs) {
      try {
        const snap = await this.reserve.createSnapshot(program.id);
        await this.reconciliation.reconcileReserve(program.id, 'scheduler');
        const pos = await this.reserve.position(program.id);
        if (pos.surplus.minor < 0n) {
          alerts.push(
            `SHORTFALL · ${program.code} (${program.id}): eligible ${pos.eligibleReserve.minor} ` +
              `< required ${pos.requiredReserve.minor} (short ${pos.surplus.minor} ${pos.currency}). ` +
              `ratio=${pos.reserveRatioBps ?? 'n/a'}bps snapshot=${snap.id}`,
          );
        }
        if (pos.liabilityAgeSeconds === null) {
          alerts.push(`STALE FEED · ${program.code} (${program.id}): no PayChain liability snapshot on record.`);
        } else if (pos.liabilityAgeSeconds > this.feedStaleSeconds) {
          alerts.push(
            `STALE FEED · ${program.code} (${program.id}): liability feed is ${pos.liabilityAgeSeconds}s old ` +
              `(threshold ${this.feedStaleSeconds}s).`,
          );
        }
      } catch (err) {
        alerts.push(`ERROR · ${program.code} (${program.id}): reserve cycle failed — ${(err as Error).message}`);
      }
    }
    this.logger.log(`reserve-cycle: processed ${programs.length} program(s), ${alerts.length} alert(s).`);
    if (alerts.length > 0) {
      await this.notify.notify(
        `Reserve alerts (${alerts.length})`,
        `Trustee reserve cycle at ${this.clock.nowIso()} raised ${alerts.length} alert(s):\n\n` +
          alerts.map((a) => `• ${a}`).join('\n'),
      );
    }
  }

  /**
   * Email a digest of newly dead-lettered webhook events. Already-alerted event
   * ids are remembered in a Redis set so each dead-letter is reported once; when
   * Redis is unavailable we skip (avoids repeat emails every tick).
   */
  private async deadLetterAlert(): Promise<void> {
    const dead = await this.prisma.outboxEvent.findMany({
      where: { deadLettered: true },
      select: { id: true, eventType: true, targetPlatform: true, attempts: true },
      orderBy: { sequence: 'desc' },
      take: 100,
    });
    if (dead.length === 0) return;

    const client = this.redis.client;
    const setKey = 'trustee:alert:deadletter:sent';
    if (!client) {
      // No Redis → cannot dedupe; skip to avoid emailing the same digest each tick.
      return;
    }
    // SISMEMBER per id via pipeline (portable across Redis versions).
    const pipe = client.pipeline();
    for (const d of dead) pipe.sismember(setKey, d.id);
    const results = await pipe.exec().catch(() => null);
    const fresh = results
      ? dead.filter((_, i) => results[i]?.[1] === 0)
      : dead;
    if (fresh.length === 0) return;

    await this.notify.notify(
      `Webhook dead-letters (${fresh.length})`,
      `The following outbox events exhausted delivery retries and were dead-lettered:\n\n` +
        fresh
          .map((d) => `• ${d.eventType} → ${d.targetPlatform} (event ${d.id}, ${d.attempts} attempts)`)
          .join('\n') +
        `\n\nInvestigate the receiver, then replay from the admin portal delivery log.`,
    );
    await client.sadd(setKey, ...fresh.map((d) => d.id));
    this.logger.warn(`deadletter-alert: emailed ${fresh.length} new dead-letter(s).`);
  }
}
