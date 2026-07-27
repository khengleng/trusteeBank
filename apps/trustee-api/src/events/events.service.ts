import { Injectable } from '@nestjs/common';
import { SigningPurpose, canonicalize } from '@trustee/cryptography';
import { PrismaService } from '../infra/prisma.service';
import { SigningService } from '../infra/signing.service';

/** Canonical event types published to PayChain (§29). */
export const PlatformEvent = {
  FUNDING_INSTRUCTION_CREATED: 'funding.instruction.created',
  DEPOSIT_DETECTED: 'deposit.detected',
  DEPOSIT_CLEARED: 'deposit.cleared',
  DEPOSIT_MATCHED: 'deposit.matched',
  DEPOSIT_HELD: 'deposit.held',
  DEPOSIT_REJECTED: 'deposit.rejected',
  RESERVE_SNAPSHOT_CREATED: 'reserve.snapshot.created',
  RESERVE_SHORTFALL_DETECTED: 'reserve.shortfall.detected',
  RESERVE_RESTORED: 'reserve.restored',
  MINT_AUTHORIZATION_APPROVED: 'mint.authorization.approved',
  MINT_AUTHORIZATION_REJECTED: 'mint.authorization.rejected',
  MINT_AUTHORIZATION_EXPIRED: 'mint.authorization.expired',
  MINT_CONFIRMED: 'mint.confirmed',
  REDEMPTION_APPROVED: 'redemption.approved',
  REDEMPTION_BURN_CONFIRMED: 'redemption.burn.confirmed',
  REDEMPTION_PAYOUT_SUBMITTED: 'redemption.payout.submitted',
  REDEMPTION_PAYOUT_CONFIRMED: 'redemption.payout.confirmed',
  REDEMPTION_COMPLETED: 'redemption.completed',
  RECONCILIATION_EXCEPTION_CREATED: 'reconciliation.exception.created',
  RECONCILIATION_EXCEPTION_RESOLVED: 'reconciliation.exception.resolved',
  COMPLIANCE_HOLD_CREATED: 'compliance.hold.created',
  PROGRAM_SUSPENDED: 'program.suspended',
  ASSET_SUSPENDED: 'asset.suspended',
} as const;
export type PlatformEvent = (typeof PlatformEvent)[keyof typeof PlatformEvent];

/** Signed events to PayKH (update §19). */
export const PaykhEvent = {
  PAYMENT_DETECTED: 'paykh.payment.detected',
  PAYMENT_CONFIRMED: 'paykh.payment.confirmed',
  PAYMENT_REJECTED: 'paykh.payment.rejected',
  PAYMENT_DUPLICATE: 'paykh.payment.duplicate',
  PAYMENT_REFUNDED: 'paykh.payment.refunded',
  PROFILE_VERIFIED: 'paykh.payment-profile.verified',
  PROFILE_SUSPENDED: 'paykh.payment-profile.suspended',
  PROGRAM_FUND_CLEARED: 'paykh.program-fund.cleared',
  PROGRAM_FUND_LOW: 'paykh.program-fund.low',
  PROGRAM_FUND_EXHAUSTED: 'paykh.program-fund.exhausted',
  SETTLEMENT_APPROVED: 'paykh.settlement.approved',
  SETTLEMENT_SUBMITTED: 'paykh.settlement.submitted',
  SETTLEMENT_CONFIRMED: 'paykh.settlement.confirmed',
  RECONCILIATION_EXCEPTION: 'paykh.reconciliation.exception',
  TENANT_SUSPENDED: 'paykh.tenant.suspended',
  // Backed loyalty stablecoin lifecycle (update §23).
  LOYALTY_ISSUED: 'paykh.loyalty.issued',
  LOYALTY_REDEEMED: 'paykh.loyalty.redeemed',
  LOYALTY_RECONCILED: 'paykh.loyalty.reconciled',
  LOYALTY_RESERVE_DRIFT: 'paykh.loyalty.reserve-drift',
} as const;
export type PaykhEvent = (typeof PaykhEvent)[keyof typeof PaykhEvent];

export type TargetPlatform = 'PAYCHAIN' | 'PAYKH';

/**
 * Transactional outbox for signed events (§29). Events are written with an
 * asymmetric signature (webhook key) and a monotonic sequence; a separate
 * worker delivers them with retries and a dead-letter queue. Events are routed
 * to the target client platform (PayChain or PayKH) with separate audit context
 * (update §3/§18/§19).
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
  ) {}

  async publish(
    eventType: PlatformEvent | PaykhEvent,
    payload: Record<string, unknown>,
    targetPlatform: TargetPlatform = 'PAYCHAIN',
  ): Promise<{ id: string }> {
    const signature = this.signing.sign(SigningPurpose.WEBHOOK, {
      eventType,
      targetPlatform,
      payload,
    });
    const event = await this.prisma.outboxEvent.create({
      data: {
        eventType,
        targetPlatform,
        payload: JSON.parse(
          JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        ),
        signatureKeyId: signature.keyId,
        signatureValue: signature.value,
      },
      select: { id: true },
    });
    return event;
  }

  /** Convenience for PayKH-targeted events. */
  publishToPaykh(eventType: PaykhEvent, payload: Record<string, unknown>) {
    return this.publish(eventType, payload, 'PAYKH');
  }

  /**
   * Publish an artifact-bearing event (trustee-events-contract). The artifact is
   * signed with a PURPOSE-specific key (not the webhook key) so a compromised
   * webhook key cannot forge a mint authorization or reserve figure. The stored
   * signatureKeyId/Value are the artifact's signature; the delivery worker places
   * `artifact` + `signature{keyId,alg,value}` at the top of the POST body.
   */
  async publishWithArtifact(
    eventType: PlatformEvent,
    payload: Record<string, unknown>,
    artifact: Record<string, unknown>,
    purpose: SigningPurpose,
    targetPlatform: TargetPlatform = 'PAYCHAIN',
  ): Promise<{ id: string }> {
    // Sign the canonical artifact; store the exact canonical string so PayChain
    // verifies over the raw bytes, then JSON.parses.
    const artifactStr = canonicalize(artifact);
    const signature = this.signing.sign(purpose, artifact); // signs canonical(artifact) == artifactStr
    const event = await this.prisma.outboxEvent.create({
      data: {
        eventType,
        targetPlatform,
        payload: JSON.parse(
          JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        ),
        artifact: artifactStr,
        signatureKeyId: signature.keyId,
        signatureValue: signature.value,
      },
      select: { id: true },
    });
    return event;
  }
}
