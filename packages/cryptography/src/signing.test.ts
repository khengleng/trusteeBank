import { describe, it, expect } from 'vitest';
import {
  generateSigningKey,
  signPayload,
  verifyPayload,
  canonicalize,
  SigningPurpose,
} from './signing';
import { sha256Hex, hashesEqual } from './hashing';

const NOW = '2026-01-01T00:00:00.000Z';

describe('canonicalize', () => {
  it('is order-independent for object keys', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it('renders bigint as decimal string', () => {
    expect(canonicalize({ n: 10n })).toBe('{"n":"10"}');
  });
});

describe('signing', () => {
  it('verifies a valid signature', () => {
    const key = generateSigningKey('mint-1', SigningPurpose.MINT_AUTHORIZATION, NOW);
    const payload = { authorizationId: 'ma_1', amount: 100_00n, asset: 'PUSD' };
    const sig = signPayload(key, payload);
    expect(verifyPayload(key.publicKeyPem, payload, sig)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const key = generateSigningKey('mint-1', SigningPurpose.MINT_AUTHORIZATION, NOW);
    const payload = { authorizationId: 'ma_1', amount: 100_00n };
    const sig = signPayload(key, payload);
    const tampered = { authorizationId: 'ma_1', amount: 999_99n };
    expect(verifyPayload(key.publicKeyPem, tampered, sig)).toBe(false);
  });

  it('rejects a signature verified with the wrong key', () => {
    const key1 = generateSigningKey('k1', SigningPurpose.MINT_AUTHORIZATION, NOW);
    const key2 = generateSigningKey('k2', SigningPurpose.MINT_AUTHORIZATION, NOW);
    const payload = { x: 1 };
    const sig = signPayload(key1, payload);
    expect(verifyPayload(key2.publicKeyPem, payload, sig)).toBe(false);
  });

  it('signature is stable across equal-but-reordered payloads', () => {
    const key = generateSigningKey('k', SigningPurpose.RESERVE_SNAPSHOT, NOW);
    const sig = signPayload(key, { a: 1, b: 2 });
    expect(verifyPayload(key.publicKeyPem, { b: 2, a: 1 }, sig)).toBe(true);
  });
});

describe('hashing', () => {
  it('produces stable sha256 hex', () => {
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
  it('compares hashes safely', () => {
    expect(hashesEqual(sha256Hex('a'), sha256Hex('a'))).toBe(true);
    expect(hashesEqual(sha256Hex('a'), sha256Hex('b'))).toBe(false);
  });
});
