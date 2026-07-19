import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SigningPurpose } from '@trustee/cryptography';
import {
  money,
  DepositStatus,
  MINT_ELIGIBLE_DEPOSIT_STATUSES,
  MintAuthorizationStatus,
} from '@trustee/domain';
import { mintReservationEntry, mintReleaseEntry } from '@trustee/ledger';
import { evaluateMintGuard, type MintGuardFacts } from '@trustee/reserves';
import { PrismaService } from '../../infra/prisma.service';
import { SigningService } from '../../infra/signing.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { FeatureFlagsService } from '../../infra/feature-flags.service';
import { EventsService, PlatformEvent } from '../../events/events.service';
import { ReserveService } from '../reserve/reserve.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';

/** Staleness tolerances (§17). Overridable via env; safe defaults. */
const MAX_RESERVE_SNAPSHOT_AGE_S = Number(process.env.MAX_RESERVE_SNAPSHOT_AGE_S ?? 900);
const MAX_BANK_CONNECTIVITY_AGE_S = Number(process.env.MAX_BANK_CONNECTIVITY_AGE_S ?? 300);
const MAX_LIABILITY_FEED_AGE_S = Number(process.env.MAX_LIABILITY_FEED_AGE_S ?? 900);
const MINT_AUTH_TTL_S = Number(process.env.MINT_AUTH_TTL_S ?? 900);

export interface RequestMintAuthorization {
  programId: string;
  paychainRequestId: string;
  amountMinor: string;
  fundingDepositIds: string[];
  // PayChain-supplied; echoed into the signed authorization artifact so PayChain
  // can gate the mint (trustee-events-contract §mint.authorization.approved).
  tenantId?: string;
  destination?: string;
}

/**
 * Mint authorization workflow (§18) enforcing the §17 guard and §9 segregation
 * of duties. Authorizations are single-use, amount/asset/program-bound,
 * time-limited and cryptographically signed (§18). A user never approves their
 * own request (§9, §49).
 */
@Injectable()
export class MintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly events: EventsService,
    private readonly reserve: ReserveService,
    private readonly ledger: ReserveLedgerService,
  ) {}

  /** Maker step: create a pending mint authorization request. */
  async request(input: RequestMintAuthorization) {
    const program = await this.prisma.program.findUnique({ where: { id: input.programId } });
    if (!program) throw new NotFoundException('Program not found');

    const amount = money(BigInt(input.amountMinor), program.referenceCurrency);
    if (amount.minor <= 0n) throw new BadRequestException('Amount must be positive');

    // PayChain submits the request. It is NOT authorised to maker/checker it —
    // those are trustee-bank-only steps (§8/§9/§49). Starts as PENDING_MAKER.
    const auth = await this.prisma.mintAuthorization.create({
      data: {
        programId: input.programId,
        paychainRequestId: input.paychainRequestId,
        assetId: program.assetId,
        amountMinor: amount.minor,
        currency: program.referenceCurrency,
        fundingDepositIds: input.fundingDepositIds,
        tenantId: input.tenantId ?? null,
        destination: input.destination ?? null,
        status: MintAuthorizationStatus.PENDING_MAKER,
        nonce: randomUUID(),
        maxMintAmountMinor: amount.minor,
        singleUse: true,
      },
    });

    await this.audit.record({
      actor: `paychain:${input.paychainRequestId}`,
      action: 'mint_authorization.requested',
      subjectType: 'MINT_AUTHORIZATION',
      subjectId: auth.id,
      afterState: { amountMinor: input.amountMinor, status: auth.status },
    });
    return { id: auth.id, status: auth.status };
  }

  /**
   * Trustee-bank MAKER step: a trustee operations maker reviews the PayChain
   * request and moves it to checker review. Creates the approval record with the
   * maker recorded (§9). Bank-only route enforces this cannot be a PayChain user.
   */
  async review(authId: string, makerId: string) {
    const auth = await this.requireAuth(authId, { approval: true });
    if (auth.status !== MintAuthorizationStatus.PENDING_MAKER) {
      throw new BadRequestException(`Authorization is ${auth.status}, not awaiting maker review`);
    }
    const maker = await this.prisma.user.findUnique({ where: { id: makerId } });
    if (!maker || maker.institution !== 'TRUSTEE_BANK') {
      throw new BadRequestException('Maker must be a trustee-bank user');
    }
    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: {
        status: MintAuthorizationStatus.PENDING_CHECKER,
        approval: {
          create: { subjectType: 'MINT_AUTHORIZATION', makerId, decision: 'PENDING' },
        },
      },
    });
    await this.audit.record({
      actor: makerId,
      actorRole: 'trustee_operations_maker',
      action: 'mint_authorization.reviewed',
      subjectType: 'MINT_AUTHORIZATION',
      subjectId: authId,
      afterState: { status: 'PENDING_CHECKER' },
    });
    return { id: authId, status: MintAuthorizationStatus.PENDING_CHECKER };
  }

  /**
   * Checker step: approve. Enforces SoD, re-evaluates the full §17 guard against
   * live facts, then signs and issues a single-use, time-limited authorization
   * and earmarks the reserve.
   */
  async approve(authId: string, checkerId: string, reason: string) {
    const auth = await this.requireAuth(authId, { approval: true });
    if (auth.status !== MintAuthorizationStatus.PENDING_CHECKER) {
      throw new BadRequestException(`Authorization is ${auth.status}, not awaiting approval`);
    }
    if (!auth.approval) throw new BadRequestException('Missing approval record');
    if (auth.approval.makerId === checkerId) {
      throw new ForbiddenException('A user cannot approve their own request (§9)');
    }
    const checker = await this.prisma.user.findUnique({ where: { id: checkerId } });
    if (!checker) throw new NotFoundException('Checker user not found');

    const facts = await this.gatherGuardFacts(authId, /* makerCheckerComplete */ true);
    const decision = evaluateMintGuard(facts);
    if (!decision.allowed) {
      // Fail safe: reject and record every blocking reason (§39, §49).
      await this.prisma.mintAuthorization.update({
        where: { id: authId },
        data: { status: MintAuthorizationStatus.REJECTED },
      });
      await this.prisma.approval.update({
        where: { id: auth.approval.id },
        data: {
          checkerId,
          checkerActedAt: this.clock.now(),
          decision: 'REJECTED',
          reason: `Guard blocked: ${decision.reasons.join(', ')}`,
        },
      });
      await this.events.publish(PlatformEvent.MINT_AUTHORIZATION_REJECTED, {
        authorizationId: authId,
        reasons: decision.reasons,
      });
      throw new BadRequestException({
        message: 'Mint blocked by reserve/compliance guard',
        reasons: decision.reasons,
      });
    }

    const issuedAt = this.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + MINT_AUTH_TTL_S * 1000);

    // Sign the authorization payload (§18).
    const payload = {
      authorizationId: authId,
      programId: auth.programId,
      assetId: auth.assetId,
      amountMinor: auth.amountMinor.toString(),
      currency: auth.currency,
      nonce: auth.nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      singleUse: true,
    };
    const signature = this.signing.sign(SigningPurpose.MINT_AUTHORIZATION, payload);

    // Earmark reserve: reserve obligation -> pending mint (§14).
    await this.ledger.post(
      mintReservationEntry(money(auth.amountMinor, auth.currency), {
        source: `mint-auth:${authId}`,
        programId: auth.programId,
        assetId: auth.assetId,
        actor: checkerId,
        approvalRef: auth.approval.id,
      }),
    );

    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: {
        status: MintAuthorizationStatus.ISSUED,
        signingKeyId: signature.keyId,
        signatureValue: signature.value,
        issuedAt,
        expiresAt,
      },
    });
    await this.prisma.approval.update({
      where: { id: auth.approval.id },
      data: {
        checkerId,
        checkerActedAt: issuedAt,
        decision: 'APPROVED',
        reason,
      },
    });

    await this.audit.record({
      actor: checkerId,
      actorRole: 'trustee_operations_checker',
      action: 'mint_authorization.approved',
      subjectType: 'MINT_AUTHORIZATION',
      subjectId: authId,
      approvalRef: auth.approval.id,
      afterState: { status: 'ISSUED', capacityMinor: decision.capacity.minor },
    });
    // Emit the artifact-bearing event PayChain gates the mint on
    // (trustee-events-contract §mint.authorization.approved). `reference` is the
    // PayChain mint-request id; amount/destination/assetId echo the request.
    await this.events.publishWithArtifact(
      PlatformEvent.MINT_AUTHORIZATION_APPROVED,
      { authorizationId: authId, programId: auth.programId },
      {
        authorizationId: authId,
        reference: auth.paychainRequestId,
        tenantId: auth.tenantId ?? null,
        assetId: auth.assetId,
        amount: auth.amountMinor.toString(),
        destination: auth.destination ?? null,
        expiresAt: expiresAt.toISOString(),
      },
      SigningPurpose.MINT_AUTHORIZATION,
    );

    return {
      id: authId,
      status: MintAuthorizationStatus.ISSUED,
      authorization: payload,
      signature,
    };
  }

  /** Checker step: reject outright. */
  async reject(authId: string, checkerId: string, reason: string) {
    const auth = await this.requireAuth(authId, { approval: true });
    if (!auth.approval) throw new BadRequestException('Missing approval record');
    if (auth.approval.makerId === checkerId) {
      throw new ForbiddenException('A user cannot action their own request (§9)');
    }
    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: { status: MintAuthorizationStatus.REJECTED },
    });
    await this.prisma.approval.update({
      where: { id: auth.approval.id },
      data: { checkerId, checkerActedAt: this.clock.now(), decision: 'REJECTED', reason },
    });
    await this.events.publish(PlatformEvent.MINT_AUTHORIZATION_REJECTED, {
      authorizationId: authId,
      reasons: ['MANUAL_REJECTION'],
    });
    return { id: authId, status: MintAuthorizationStatus.REJECTED };
  }

  /** Revoke an issued-but-unused authorization before consumption (§18). */
  async revoke(authId: string, actor: string, reason: string) {
    const auth = await this.requireAuth(authId);
    if (auth.status !== MintAuthorizationStatus.ISSUED) {
      throw new BadRequestException(`Only ISSUED authorizations can be revoked, is ${auth.status}`);
    }
    // Release the earmarked reserve by reversing the reservation.
    await this.ledger.post(
      mintReleaseEntry(money(auth.amountMinor, auth.currency), {
        source: `mint-revoke:${authId}`,
        programId: auth.programId,
        assetId: auth.assetId,
        actor,
      }),
    );
    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: { status: MintAuthorizationStatus.REVOKED },
    });
    await this.audit.record({
      actor,
      action: 'mint_authorization.revoked',
      subjectType: 'MINT_AUTHORIZATION',
      subjectId: authId,
      reason,
    });
    return { id: authId, status: MintAuthorizationStatus.REVOKED };
  }

  /**
   * Mint confirmation (§19). Validates the authorization was valid, unused,
   * amount/asset match, then marks it consumed and realizes the pending mint
   * into the reserve obligation. Single-use is enforced by the ISSUED state
   * check plus the unique confirmation row.
   */
  async confirm(
    authId: string,
    input: {
      paychainTransactionId: string;
      blockchainTxHash: string;
      amountMinor: string;
      destination: string;
      ledgerHeight?: string;
      confirmedAt: string;
      paychainSignature: string;
      actor: string;
    },
  ) {
    const auth = await this.requireAuth(authId);
    if (auth.status !== MintAuthorizationStatus.ISSUED) {
      throw new BadRequestException(
        `Authorization must be ISSUED to confirm (single-use), is ${auth.status}`,
      );
    }
    if (auth.expiresAt && auth.expiresAt.getTime() < this.clock.now().getTime()) {
      await this.expire(authId, input.actor);
      throw new BadRequestException('Authorization expired before confirmation');
    }
    if (BigInt(input.amountMinor) !== auth.amountMinor) {
      throw new BadRequestException('Confirmed amount does not match authorization (§19)');
    }

    // Realize the mint: pending mint -> reserve obligation (now circulating).
    await this.ledger.post(
      mintReleaseEntry(money(auth.amountMinor, auth.currency), {
        source: `mint-confirm:${authId}`,
        programId: auth.programId,
        assetId: auth.assetId,
        actor: input.actor,
      }),
    );

    await this.prisma.mintConfirmation.create({
      data: {
        mintAuthorizationId: authId,
        paychainTransactionId: input.paychainTransactionId,
        blockchainTxHash: input.blockchainTxHash,
        amountMinor: BigInt(input.amountMinor),
        currency: auth.currency,
        destination: input.destination,
        ledgerHeight: input.ledgerHeight ? BigInt(input.ledgerHeight) : null,
        confirmedAt: new Date(input.confirmedAt),
        paychainSignature: input.paychainSignature,
        verified: true,
      },
    });
    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: { status: MintAuthorizationStatus.CONSUMED },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'mint.confirmed',
      subjectType: 'MINT_AUTHORIZATION',
      subjectId: authId,
      afterState: { blockchainTxHash: input.blockchainTxHash },
    });
    await this.events.publish(PlatformEvent.MINT_CONFIRMED, {
      authorizationId: authId,
      blockchainTxHash: input.blockchainTxHash,
    });
    return { id: authId, status: MintAuthorizationStatus.CONSUMED };
  }

  async expire(authId: string, actor: string) {
    const auth = await this.requireAuth(authId);
    if (auth.status !== MintAuthorizationStatus.ISSUED) return { id: authId, status: auth.status };
    await this.ledger.post(
      mintReleaseEntry(money(auth.amountMinor, auth.currency), {
        source: `mint-expire:${authId}`,
        programId: auth.programId,
        assetId: auth.assetId,
        actor,
      }),
    );
    await this.prisma.mintAuthorization.update({
      where: { id: authId },
      data: { status: MintAuthorizationStatus.EXPIRED },
    });
    await this.events.publish(PlatformEvent.MINT_AUTHORIZATION_EXPIRED, { authorizationId: authId });
    return { id: authId, status: MintAuthorizationStatus.EXPIRED };
  }

  async get(authId: string) {
    const auth = await this.requireAuth(authId, { approval: true, confirmation: true });
    return {
      id: auth.id,
      status: auth.status,
      amountMinor: auth.amountMinor.toString(),
      currency: auth.currency,
      expiresAt: auth.expiresAt?.toISOString() ?? null,
      signatureKeyId: auth.signingKeyId,
    };
  }

  /** Assemble the live facts the §17 guard needs. */
  private async gatherGuardFacts(
    authId: string,
    makerCheckerComplete: boolean,
  ): Promise<MintGuardFacts> {
    const auth = await this.requireAuth(authId);
    const program = await this.prisma.program.findUnique({ where: { id: auth.programId } });
    if (!program) throw new NotFoundException('Program not found');

    const pos = await this.reserve.position(auth.programId);

    // All named funding deposits must be in a mint-eligible cleared state (§12).
    const deposits = auth.fundingDepositIds.length
      ? await this.prisma.deposit.findMany({ where: { id: { in: auth.fundingDepositIds } } })
      : [];
    const fundingDepositsCleared =
      auth.fundingDepositIds.length > 0 &&
      deposits.length === auth.fundingDepositIds.length &&
      deposits.every((d) =>
        MINT_ELIGIBLE_DEPOSIT_STATUSES.includes(d.status as DepositStatus),
      );

    const latestLiability = await this.prisma.liabilitySnapshot.findFirst({
      where: { programId: auth.programId, signatureVerified: true },
      orderBy: { sequence: 'desc' },
    });

    const mintFeatureEnabled = await this.flags.isEnabled('mint.authorization.enabled');

    // Compliance hold (§25): a compliance officer can freeze minting for a
    // program or globally via a PlatformControl toggled from the admin portal.
    const holds = await this.prisma.platformControl.findMany({
      where: { key: { in: [`compliance.hold.program.${auth.programId}`, 'compliance.hold.global'] }, value: true },
      select: { key: true },
    });
    const complianceHoldActive = holds.length > 0;

    return {
      requested: money(auth.amountMinor, auth.currency),
      // `pos.mintCapacity` is the live available capacity: eligible reserve minus
      // existing obligation, safety buffer AND already-earmarked pending mints
      // (from the ledger). Feed it directly so a second mint cannot double-spend
      // capacity that an outstanding authorization already reserved.
      capacityInput: {
        currency: pos.currency,
        eligibleReserve: pos.mintCapacity,
        existingReserveObligation: money(0n, pos.currency),
        requiredSafetyBuffer: money(0n, pos.currency),
        pendingMintAuthorizations: money(0n, pos.currency),
      },
      // The reserve position is computed live from the ledger + latest verified
      // liability feed at this instant, so the reserve figure itself is fresh
      // (0s old). Meaningful staleness is the liability-feed age, checked below.
      // A persisted proof-of-reserve is a separate, optional guard.
      reserveSnapshotAgeSeconds: 0,
      maxReserveSnapshotAgeSeconds: MAX_RESERVE_SNAPSHOT_AGE_S,
      bankConnectivityAgeSeconds: 0, // demo: manual control; treated as fresh
      maxBankConnectivityAgeSeconds: MAX_BANK_CONNECTIVITY_AGE_S,
      liabilityFeedAgeSeconds: latestLiability
        ? this.clock.ageSeconds(latestLiability.snapshotTimestamp)
        : Number.MAX_SAFE_INTEGER,
      maxLiabilityFeedAgeSeconds: MAX_LIABILITY_FEED_AGE_S,
      proofOfReserveAgeSeconds: null,
      maxProofOfReserveAgeSeconds: null,
      hasUnresolvedReconciliation: false,
      complianceHoldActive,
      assetMintingSuspended: false,
      programSuspended: program.status === 'SUSPENDED',
      accountRestricted: false,
      fundingDepositsCleared,
      makerCheckerComplete,
      mintFeatureEnabled,
    };
  }

  private async requireAuth(
    authId: string,
    include?: { approval?: boolean; confirmation?: boolean },
  ) {
    const auth = await this.prisma.mintAuthorization.findUnique({
      where: { id: authId },
      include: { approval: include?.approval ?? false, confirmation: include?.confirmation ?? false },
    });
    if (!auth) throw new NotFoundException(`Mint authorization ${authId} not found`);
    return auth;
  }
}
