import { createPublicKey, verify as edVerify } from 'node:crypto';
import { canonicalize } from '@trustee/cryptography';

export interface JwksKey {
  purpose: string;
  keyId: string;
  publicKeyPem: string;
  status?: string;
}

/** The trustee's published verification keys. */
export function jwksByKeyId(keys: JwksKey[]): Map<string, JwksKey> {
  return new Map(keys.map((k) => [k.keyId, k]));
}

/**
 * Independently verify a signed trustee artifact against the JWKS — the auditor's
 * ground-truth check. Ed25519 over the EXACT canonical bytes (verify the raw
 * string the trustee signed; do not re-serialize). Returns pass + why.
 */
export function verifyArtifact(
  canonicalBytes: string,
  signature: { keyId: string; value: string } | undefined,
  jwks: Map<string, JwksKey>,
): { pass: boolean; note: string } {
  if (!signature) return { pass: false, note: 'no signature present' };
  const key = jwks.get(signature.keyId);
  if (!key) return { pass: false, note: `keyId ${signature.keyId} not in JWKS` };
  try {
    const pub = createPublicKey(key.publicKeyPem);
    const ok = edVerify(null, Buffer.from(canonicalBytes), pub, Buffer.from(signature.value, 'base64'));
    return { pass: ok, note: ok ? `verified vs ${signature.keyId}` : 'signature mismatch' };
  } catch (err) {
    return { pass: false, note: (err as Error).message };
  }
}

/** Re-canonicalize a parsed object to the exact bytes a trustee signature covers. */
export function canonicalOf(obj: unknown): string {
  return canonicalize(obj);
}
