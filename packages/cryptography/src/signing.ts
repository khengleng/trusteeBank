/**
 * Asymmetric signing for mint authorizations, reserve snapshots, attestations
 * and webhooks (§38 Key Management, §28/§29 signing).
 *
 * Uses Ed25519 via Node's crypto. Keys are referenced by a purpose-scoped
 * key ID so that separate keys are used per purpose (§38: "Do not use one
 * signing key for all purposes"). In production these keys live in a KMS/HSM;
 * this module deals only with the sign/verify operations and a stable,
 * canonical serialization of the payload.
 */

import {
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from 'node:crypto';

/** Signing key purposes — one key per purpose (§38). */
export const SigningPurpose = {
  API_AUTH: 'API_AUTH',
  REQUEST_SIGNING: 'REQUEST_SIGNING',
  RESPONSE_SIGNING: 'RESPONSE_SIGNING',
  MINT_AUTHORIZATION: 'MINT_AUTHORIZATION',
  RESERVE_SNAPSHOT: 'RESERVE_SNAPSHOT',
  ATTESTATION: 'ATTESTATION',
  WEBHOOK: 'WEBHOOK',
  DOCUMENT_HASH: 'DOCUMENT_HASH',
} as const;
export type SigningPurpose = (typeof SigningPurpose)[keyof typeof SigningPurpose];

export interface SigningKey {
  readonly keyId: string;
  readonly purpose: SigningPurpose;
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly createdAt: string; // ISO 8601, injected by caller (no clock here)
}

export interface Signature {
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  /** Base64-encoded signature over the canonical payload bytes. */
  readonly value: string;
}

/**
 * Deterministic JSON canonicalization: object keys sorted recursively, bigint
 * rendered as decimal string, no insignificant whitespace. Two structurally
 * equal payloads always produce identical bytes, so signatures are stable.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Generate an Ed25519 key pair for a purpose. `createdAt` must be supplied. */
export function generateSigningKey(
  keyId: string,
  purpose: SigningPurpose,
  createdAt: string,
): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    purpose,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    createdAt,
  };
}

function loadPrivate(pem: string): KeyObject {
  return createPrivateKey(pem);
}
function loadPublic(pem: string): KeyObject {
  return createPublicKey(pem);
}

/** Sign an arbitrary payload; it is canonicalized before signing. */
export function signPayload(key: SigningKey, payload: unknown): Signature {
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  const sig = nodeSign(null, bytes, loadPrivate(key.privateKeyPem));
  return { keyId: key.keyId, algorithm: 'ed25519', value: sig.toString('base64') };
}

/** Verify a signature against a payload and a known public key PEM. */
export function verifyPayload(
  publicKeyPem: string,
  payload: unknown,
  signature: Signature,
): boolean {
  if (signature.algorithm !== 'ed25519') return false;
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  try {
    return nodeVerify(
      null,
      bytes,
      loadPublic(publicKeyPem),
      Buffer.from(signature.value, 'base64'),
    );
  } catch {
    return false;
  }
}
