/**
 * Password hashing with scrypt (Node crypto). Format: `scrypt$N$salthex$hashhex`.
 * Verification is constant-time. No plaintext passwords are ever stored or logged.
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N });
  return `scrypt$${N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2] as string, 'hex');
  const expected = Buffer.from(parts[3] as string, 'hex');
  const actual = scryptSync(password, salt, expected.length, { N: n });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
