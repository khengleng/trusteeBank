/**
 * Prisma client singleton for the platform. Re-exports the generated client
 * types so services depend on `@trustee/database` rather than a relative path
 * into `node_modules`.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

let client: PrismaClient | undefined;

/** Lazily create and reuse a single PrismaClient across the process. */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: ['warn', 'error'],
    });
  }
  return client;
}
