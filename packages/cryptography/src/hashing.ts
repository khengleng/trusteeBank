/**
 * Hashing helpers for evidence anchoring (§32) and body-hash request security
 * (§28). SHA-256, hex-encoded. Only document hashes may be anchored — never
 * the documents themselves (§32).
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
