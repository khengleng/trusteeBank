/**
 * Trustee worker entrypoint. Runs the webhook-delivery loop on an interval.
 * Deployed as a separate Railway service with no public ingress (domain config
 * §7). Additional workers (reconciliation, reporting, scheduler) plug in here.
 */

import { deliverPending } from './webhook-delivery';

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);

let running = true;

async function loop(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[trustee-worker] webhook delivery loop every ${INTERVAL_MS}ms`);
  while (running) {
    try {
      const delivered = await deliverPending(new Date());
      if (delivered > 0) {
        // eslint-disable-next-line no-console
        console.log(`[trustee-worker] delivered ${delivered} events`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[trustee-worker] delivery pass failed', err);
    }
    await sleep(INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown(): void {
  // eslint-disable-next-line no-console
  console.log('[trustee-worker] shutting down');
  running = false;
  setTimeout(() => process.exit(0), 100);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void loop();
