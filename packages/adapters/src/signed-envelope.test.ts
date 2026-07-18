import { describe, it, expect } from 'vitest';
import {
  generateSigningKey,
  signPayload,
  verifyPayload,
  SigningPurpose,
} from '@trustee/cryptography';
import { envelopeSigningSubject, buildSignedEnvelope, type EnvelopeInput } from './signed-envelope';

const input: EnvelopeInput = {
  eventId: 'evt_1',
  eventType: 'paychain.mint.authorized',
  eventSequence: '42',
  targetPlatform: 'PAYCHAIN',
  timestamp: '2026-01-01T00:00:00.000Z',
  clientId: 'client_paychain_demo',
  programId: 'prog_1',
  correlationId: 'corr_1',
  requestId: 'req_1',
  nonce: 'nonce_1',
  apiVersion: 'v1',
  payload: { authorizationId: 'ma_1', amountMinor: '10000' },
};

describe('signed envelope', () => {
  it('produces a verifiable signature over the envelope subject', () => {
    const key = generateSigningKey('wh', SigningPurpose.WEBHOOK, '2026-01-01T00:00:00.000Z');
    const { subject, bodyHash } = envelopeSigningSubject(input);
    const sig = signPayload(key, subject);
    const envelope = buildSignedEnvelope(input, sig);

    expect(envelope.bodyHash).toBe(bodyHash);
    expect(envelope.signingKeyId).toBe('wh');
    // A consumer recomputes the subject and verifies.
    const { subject: recomputed } = envelopeSigningSubject(input);
    expect(verifyPayload(key.publicKeyPem, recomputed, sig)).toBe(true);
  });

  it('body hash changes when payload changes (tamper evidence)', () => {
    const a = envelopeSigningSubject(input).bodyHash;
    const b = envelopeSigningSubject({ ...input, payload: { authorizationId: 'ma_1', amountMinor: '99999' } }).bodyHash;
    expect(a).not.toBe(b);
  });
});
