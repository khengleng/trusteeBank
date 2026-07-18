/**
 * TOTP (RFC 6238) for multi-factor authentication (§8 MFA). Base32 secrets,
 * HMAC-SHA1, 6 digits, 30s step. Verification allows ±1 step for clock skew.
 */
import { createHmac, randomBytes } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** otpauth:// URI for authenticator apps (Google Authenticator, Authy, …). */
export function otpauthUrl(secret: string, account: string, issuer = 'Cambobia Trustee'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function totpCode(secret: string, forTime: number): string {
  const counter = Math.floor(forTime / 1000 / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0xf;
  const bin =
    (((hmac[offset] as number) & 0x7f) << 24) |
    (((hmac[offset + 1] as number) & 0xff) << 16) |
    (((hmac[offset + 2] as number) & 0xff) << 8) |
    ((hmac[offset + 3] as number) & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
}

/** Verify a code against the current window (±1 step). `nowMs` must be supplied. */
export function verifyTotp(secret: string, code: string, nowMs: number): boolean {
  const c = code.trim();
  for (const drift of [-1, 0, 1]) {
    if (totpCode(secret, nowMs + drift * 30_000) === c) return true;
  }
  return false;
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
