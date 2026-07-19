/**
 * Builds the signed integration envelope required on every outbound request and
 * webhook (§8, domain config callback fields). The body hash is computed over a
 * canonical serialization; the signature is produced by the caller's webhook
 * signing key.
 */

import { canonicalize, sha256Hex, type Signature } from '@trustee/cryptography';
import type { SignedEnvelope } from './interfaces';

export interface EnvelopeInput {
  eventId: string;
  eventType: string;
  eventSequence: string;
  targetPlatform: string;
  timestamp: string;
  clientId: string;
  programId?: string;
  correlationId: string;
  requestId: string;
  nonce: string;
  apiVersion: string;
  payload: Record<string, unknown>;
}

/** The stable subject that is hashed and signed (excludes the signature itself). */
export function envelopeSigningSubject(input: EnvelopeInput): {
  bodyHash: string;
  subject: Record<string, unknown>;
} {
  const bodyHash = sha256Hex(canonicalize(input.payload));
  const subject = {
    eventId: input.eventId,
    eventType: input.eventType,
    eventSequence: input.eventSequence,
    targetPlatform: input.targetPlatform,
    timestamp: input.timestamp,
    clientId: input.clientId,
    programId: input.programId ?? null,
    correlationId: input.correlationId,
    requestId: input.requestId,
    nonce: input.nonce,
    apiVersion: input.apiVersion,
    bodyHash,
  };
  return { bodyHash, subject };
}

export function buildSignedEnvelope(input: EnvelopeInput, signature: Signature): SignedEnvelope {
  const { bodyHash } = envelopeSigningSubject(input);
  return {
    ...input,
    id: input.eventId,
    type: input.eventType,
    programId: input.programId,
    bodyHash,
    signingKeyId: signature.keyId,
    signature: signature.value,
  };
}
