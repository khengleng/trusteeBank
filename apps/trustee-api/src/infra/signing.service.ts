import { Injectable, Logger } from '@nestjs/common';
import {
  generateSigningKey,
  signPayload,
  verifyPayload,
  sha256Hex,
  SigningPurpose,
  type SigningKey,
  type Signature,
} from '@trustee/cryptography';

/**
 * Purpose-scoped signing keys (§38).
 *
 * Keys are loaded, in priority order:
 *  1. From `TRUSTEE_SIGNING_KEYS` (JSON map of purpose → {keyId, privateKeyPem,
 *     publicKeyPem, createdAt}) — a persistent secret so every API replica and
 *     restart uses the SAME keys, and clients can verify against a stable
 *     public key set. This is the pilot/production baseline.
 *  2. Otherwise generated in-memory (dev only) with a warning — NOT safe across
 *     multiple replicas.
 *
 * This module deals only with sign/verify. The `TRUSTEE_SIGNING_KEYS` secret is
 * a stepping stone to an external KMS/HSM signing service (§38): swap this loader
 * for a KMS-backed signer without changing callers. Private key material is
 * never logged (§37).
 */
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private readonly keys = new Map<SigningPurpose, SigningKey>();

  constructor() {
    const fromEnv = process.env.TRUSTEE_SIGNING_KEYS;
    if (fromEnv) {
      try {
        // Accept raw JSON or base64-encoded JSON (PEMs contain newlines, so the
        // secret is typically stored base64-encoded).
        const json = fromEnv.trimStart().startsWith('{')
          ? fromEnv
          : Buffer.from(fromEnv, 'base64').toString('utf8');
        const parsed = JSON.parse(json) as Record<
          string,
          { keyId: string; privateKeyPem: string; publicKeyPem: string; createdAt?: string }
        >;
        for (const purpose of Object.values(SigningPurpose)) {
          const k = parsed[purpose];
          if (!k) throw new Error(`Missing signing key for purpose ${purpose}`);
          this.keys.set(purpose, {
            keyId: k.keyId,
            purpose,
            privateKeyPem: k.privateKeyPem,
            publicKeyPem: k.publicKeyPem,
            createdAt: k.createdAt ?? '1970-01-01T00:00:00.000Z',
          });
        }
        this.logger.log('Loaded persistent signing keys from TRUSTEE_SIGNING_KEYS.');
        return;
      } catch (err) {
        throw new Error(`Failed to load TRUSTEE_SIGNING_KEYS: ${(err as Error).message}`);
      }
    }
    const createdAt = new Date().toISOString();
    for (const purpose of Object.values(SigningPurpose)) {
      const keyId = `${purpose.toLowerCase()}-${sha256Hex(purpose).slice(0, 8)}`;
      this.keys.set(purpose, generateSigningKey(keyId, purpose, createdAt));
    }
    this.logger.warn(
      'TRUSTEE_SIGNING_KEYS not set — generated in-memory keys (dev only; inconsistent across replicas). Set the secret for production (§38).',
    );
  }

  private key(purpose: SigningPurpose): SigningKey {
    const k = this.keys.get(purpose);
    if (!k) throw new Error(`No signing key for purpose ${purpose}`);
    return k;
  }

  sign(purpose: SigningPurpose, payload: unknown): Signature {
    return signPayload(this.key(purpose), payload);
  }

  verify(purpose: SigningPurpose, payload: unknown, signature: Signature): boolean {
    return verifyPayload(this.key(purpose).publicKeyPem, payload, signature);
  }

  publicKey(purpose: SigningPurpose): { keyId: string; publicKeyPem: string } {
    const k = this.key(purpose);
    return { keyId: k.keyId, publicKeyPem: k.publicKeyPem };
  }

  allPublicKeys(): Array<{ purpose: SigningPurpose; keyId: string; publicKeyPem: string }> {
    return Array.from(this.keys.values()).map((k) => ({
      purpose: k.purpose,
      keyId: k.keyId,
      publicKeyPem: k.publicKeyPem,
    }));
  }
}
