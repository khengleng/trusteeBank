import { Injectable } from '@nestjs/common';

/**
 * Injectable clock. Concentrating time access here keeps services testable and
 * makes staleness checks (§17) explicit rather than scattered `new Date()`
 * calls.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  /** Seconds elapsed since the given instant (>= 0). */
  ageSeconds(since: Date): number {
    return Math.max(0, Math.floor((this.now().getTime() - since.getTime()) / 1000));
  }
}
