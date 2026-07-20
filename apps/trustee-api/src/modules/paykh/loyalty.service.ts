import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SigningPurpose } from '@trustee/cryptography';
import {
  money,
  makePeg,
  backingForUnits,
  backingPolicyFor,
  type FundClassification,
} from '@trustee/domain';
import {
  LedgerAccountCode,
  paykhLoyaltyIssuanceEntry,
  paykhLoyaltyRedemptionEntry,
} from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../../infra/audit.service';
import { ClockService } from '../../infra/clock.service';
import { SigningService } from '../../infra/signing.service';
import { FeatureFlagsService } from '../../infra/feature-flags.service';
import { IssuanceGatewayService } from '../../infra/issuance-gateway.service';
import { EventsService, PaykhEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';
import { MerchantsService } from './merchants.service';

export interface BindLoyaltyInput {
  programFundId: string;
  decimals?: number;
  denominationMinor?: string;
  stellarAssetCode?: string;
  stellarIssuer?: string;
  stellarDistributor?: string;
  actor: string;
}

export interface IssueLoyaltyInput {
  liabilityId: string;
  customerRef: string;
  amountMinor?: string;
  units?: string;
  actor: string;
}

export interface RedeemLoyaltyInput {
  liabilityId: string;
  merchantId: string;
  customerRef: string;
  amountMinor?: string;
  units?: string;
  actor: string;
}

type Liability = Awaited<ReturnType<PrismaService['paykhLoyaltyLiability']['findUniqueOrThrow']>>;

/**
 * Backed loyalty stablecoin: issuance, redemption ("swap") and on-chain
 * reconciliation (update §23/§24).
 *
 * Invariant: outstanding loyalty stablecoin is always fully backed 1:1 by the
 * safeguarded program fund. Issuance moves value program-fund -> loyalty (bank
 * cash unchanged); redemption moves it loyalty -> merchant payable (the existing
 * settlement flow discharges it against bank cash).
 *
 * On-chain execution is delegated to PayChain (the issuer of record): the
 * trustee signs an authorization and asks PayChain to mint/burn on Stellar, then
 * independently reads Horizon to reconcile the on-chain supply. Denomination:
 * issuance may be expressed in token `units` (backing = units × denomination) or
 * directly in backing minor units.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly signing: SigningService,
    private readonly flags: FeatureFlagsService,
    private readonly gateway: IssuanceGatewayService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
    private readonly merchants: MerchantsService,
  ) {}

  /** Bind a program fund to a backed loyalty stablecoin (optionally on-chain). */
  async bind(input: BindLoyaltyInput) {
    const fund = await this.prisma.paykhProgramFund.findUnique({
      where: { id: input.programFundId },
    });
    if (!fund) throw new NotFoundException(`Program fund ${input.programFundId} not found`);

    const policy = backingPolicyFor(fund.classification as FundClassification);
    if (!policy.fiatBackingRequired) {
      throw new BadRequestException(
        `Classification ${fund.classification} is not fiat-backed; a loyalty stablecoin must be fully reserved (§23)`,
      );
    }
    const existing = await this.prisma.paykhLoyaltyLiability.findUnique({
      where: { programFundId: fund.id },
    });
    if (existing) {
      throw new ConflictException(`Program fund ${fund.id} already has a loyalty stablecoin`);
    }
    const denominationMinor = input.denominationMinor ? BigInt(input.denominationMinor) : 1n;
    if (denominationMinor <= 0n) throw new BadRequestException('denominationMinor must be positive');

    const liability = await this.prisma.paykhLoyaltyLiability.create({
      data: {
        tenantId: fund.tenantId,
        paykhProgramId: fund.paykhProgramId,
        programFundId: fund.id,
        classification: fund.classification,
        currency: fund.currency,
        pegCurrency: fund.currency, // peg currency is the reserve/backing currency
        denominationMinor,
        decimals: input.decimals ?? 2,
        stellarAssetCode: input.stellarAssetCode ?? null,
        stellarIssuer: input.stellarIssuer ?? null,
        stellarDistributor: input.stellarDistributor ?? null,
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.loyalty.bound',
      subjectType: 'PAYKH_LOYALTY_LIABILITY',
      subjectId: liability.id,
      afterState: { stellarAssetCode: input.stellarAssetCode ?? null, denominationMinor: denominationMinor.toString() },
    });
    return this.serialize(liability);
  }

  /** Issue backed loyalty stablecoin to a customer (PayChain mints on-chain). */
  async issue(input: IssueLoyaltyInput) {
    await this.flags.requireEnabled('paykh.loyalty.enabled');
    const liability = await this.require(input.liabilityId);
    const fund = await this.prisma.paykhProgramFund.findUnique({
      where: { id: liability.programFundId },
    });
    if (!fund) throw new NotFoundException(`Program fund ${liability.programFundId} not found`);

    const { amount, units } = this.resolveAmount(liability, input.amountMinor, input.units);
    if (amount.minor <= 0n) throw new BadRequestException('Issuance amount must be positive');

    // Reserve-coverage guard: cannot issue more than the cleared, un-earmarked
    // backing in the program fund. Keeps outstanding loyalty <= backing (§23).
    const available = fund.fundedMinor - fund.reservedMinor;
    if (amount.minor > available) {
      throw new BadRequestException(
        `Insufficient safeguarded backing: available ${available}, requested ${amount.minor} (§23 full-reserve)`,
      );
    }

    // Ledger: move safeguarded value program-fund -> loyalty stablecoin.
    await this.ledger.post(
      paykhLoyaltyIssuanceEntry(amount, {
        source: `paykh-loyalty-issue:${liability.id}`,
        programId: liability.tenantId,
        assetId: liability.stellarAssetCode ?? liability.paykhProgramId,
        actor: input.actor,
      }),
    );

    // Authorize + ask PayChain to mint on Stellar (trustee holds no chain key).
    const chain = await this.authorizeOnChain('ISSUE', liability, amount.minor.toString());

    const issuance = await this.prisma.$transaction(async (tx) => {
      await tx.paykhProgramFund.update({
        where: { id: fund.id },
        data: { reservedMinor: fund.reservedMinor + amount.minor },
      });
      await tx.paykhLoyaltyLiability.update({
        where: { id: liability.id },
        data: {
          outstandingMinor: liability.outstandingMinor + amount.minor,
          issuedTotalMinor: liability.issuedTotalMinor + amount.minor,
        },
      });
      return tx.paykhLoyaltyIssuance.create({
        data: {
          loyaltyLiabilityId: liability.id,
          customerRef: input.customerRef,
          units: units ?? null,
          amountMinor: amount.minor,
          currency: liability.pegCurrency,
          status: chain.status,
          paychainReference: chain.paychainReference ?? null,
          onChainTxHash: chain.onChainTxHash ?? null,
          actor: input.actor,
        },
      });
    });

    await this.audit.record({
      actor: input.actor,
      action: 'paykh.loyalty.issued',
      subjectType: 'PAYKH_LOYALTY_ISSUANCE',
      subjectId: issuance.id,
      afterState: { amountMinor: amount.minor.toString(), units: units?.toString() ?? null, paychainReference: chain.paychainReference },
    });
    await this.events.publishToPaykh(PaykhEvent.LOYALTY_ISSUED, {
      liabilityId: liability.id,
      issuanceId: issuance.id,
      amountMinor: amount.minor.toString(),
      units: units?.toString() ?? null,
      paychainReference: chain.paychainReference,
      onChainTxHash: chain.onChainTxHash,
      executedBy: chain.executedBy,
    });
    return {
      issuanceId: issuance.id,
      liabilityId: liability.id,
      amountMinor: amount.minor.toString(),
      units: units?.toString() ?? null,
      currency: liability.pegCurrency,
      onChain: chain,
    };
  }

  /** Redeem loyalty stablecoin at a merchant — the swap (PayChain burns on-chain). */
  async redeem(input: RedeemLoyaltyInput) {
    await this.flags.requireEnabled('paykh.loyalty.enabled');
    // Referential integrity: redeem only at an onboarded, ACTIVE merchant (§25).
    await this.merchants.requireActive(input.merchantId);
    const liability = await this.require(input.liabilityId);
    const { amount, units } = this.resolveAmount(liability, input.amountMinor, input.units);
    if (amount.minor <= 0n) throw new BadRequestException('Redemption amount must be positive');
    if (amount.minor > liability.outstandingMinor) {
      throw new BadRequestException(
        `Cannot redeem more than outstanding: outstanding ${liability.outstandingMinor}, requested ${amount.minor}`,
      );
    }

    // Ledger: the swap — extinguish the point, create a merchant payable.
    await this.ledger.post(
      paykhLoyaltyRedemptionEntry(amount, {
        source: `paykh-loyalty-redeem:${liability.id}`,
        programId: liability.tenantId,
        assetId: liability.stellarAssetCode ?? liability.paykhProgramId,
        actor: input.actor,
      }),
    );

    // Authorize + ask PayChain to burn/claw back on Stellar.
    const chain = await this.authorizeOnChain('BURN', liability, amount.minor.toString());

    const redemption = await this.prisma.$transaction(async (tx) => {
      await tx.paykhLoyaltyLiability.update({
        where: { id: liability.id },
        data: {
          outstandingMinor: liability.outstandingMinor - amount.minor,
          redeemedTotalMinor: liability.redeemedTotalMinor + amount.minor,
        },
      });
      return tx.paykhLoyaltyRedemption.create({
        data: {
          loyaltyLiabilityId: liability.id,
          tenantId: liability.tenantId,
          merchantId: input.merchantId,
          customerRef: input.customerRef,
          amountMinor: amount.minor,
          currency: liability.pegCurrency,
          status: 'CONFIRMED',
          paychainReference: chain.paychainReference ?? null,
          onChainTxHash: chain.onChainTxHash ?? null,
          actor: input.actor,
          confirmedAt: this.clock.now(),
        },
      });
    });

    await this.audit.record({
      actor: input.actor,
      action: 'paykh.loyalty.redeemed',
      subjectType: 'PAYKH_LOYALTY_REDEMPTION',
      subjectId: redemption.id,
      afterState: { amountMinor: amount.minor.toString(), merchantId: input.merchantId, paychainReference: chain.paychainReference },
    });
    await this.events.publishToPaykh(PaykhEvent.LOYALTY_REDEEMED, {
      liabilityId: liability.id,
      redemptionId: redemption.id,
      merchantId: input.merchantId,
      amountMinor: amount.minor.toString(),
      paychainReference: chain.paychainReference,
      onChainTxHash: chain.onChainTxHash,
    });
    return {
      redemptionId: redemption.id,
      liabilityId: liability.id,
      merchantId: input.merchantId,
      amountMinor: amount.minor.toString(),
      units: units?.toString() ?? null,
      // The merchant is now owed this amount; a settlement (maker-checker)
      // discharges it against bank cash.
      settlementRequired: true,
      onChain: chain,
    };
  }

  /**
   * Proof-of-reserve position for the loyalty asset: ledger-outstanding vs
   * independently-read on-chain circulating supply vs safeguarded backing.
   * Persists the reconciled on-chain figure and flags DRIFT on disagreement.
   */
  async reconcile(liabilityId: string) {
    const liability = await this.require(liabilityId);
    const fund = await this.prisma.paykhProgramFund.findUnique({
      where: { id: liability.programFundId },
    });

    const ledgerOutstanding = await this.ledger.accountBalance(
      liability.tenantId,
      LedgerAccountCode.LIABILITY_PAYKH_LOYALTY_STABLECOIN,
      liability.pegCurrency,
    );

    // Independently read on-chain supply from Horizon (read-only, no keys).
    let onChainSupplyMinor: bigint | null = null;
    if (liability.stellarAssetCode && liability.stellarIssuer) {
      const supply = await this.gateway.readOnChainSupply({
        assetCode: liability.stellarAssetCode,
        issuer: liability.stellarIssuer,
        decimals: liability.decimals,
      });
      if (supply) onChainSupplyMinor = BigInt(supply.circulatingMinor);
    }

    const status =
      onChainSupplyMinor !== null && onChainSupplyMinor !== ledgerOutstanding.minor
        ? 'DRIFT'
        : 'OK';

    const updated = await this.prisma.paykhLoyaltyLiability.update({
      where: { id: liability.id },
      data: {
        onChainSupplyMinor: onChainSupplyMinor ?? ledgerOutstanding.minor,
        reconciliationStatus: status,
        lastReconciledAt: this.clock.now(),
      },
    });

    await this.events.publishToPaykh(
      status === 'DRIFT' ? PaykhEvent.LOYALTY_RESERVE_DRIFT : PaykhEvent.LOYALTY_RECONCILED,
      {
        liabilityId: liability.id,
        ledgerOutstandingMinor: ledgerOutstanding.minor.toString(),
        onChainSupplyMinor: onChainSupplyMinor?.toString() ?? null,
        status,
      },
    );

    return {
      liabilityId: liability.id,
      currency: liability.pegCurrency,
      ledgerOutstandingMinor: ledgerOutstanding.minor.toString(),
      counterOutstandingMinor: updated.outstandingMinor.toString(),
      onChainSupplyMinor: onChainSupplyMinor?.toString() ?? null,
      onChainVerified: onChainSupplyMinor !== null,
      safeguardedBackingMinor: fund ? fund.fundedMinor.toString() : null,
      fullyBacked: fund ? fund.fundedMinor >= updated.outstandingMinor : null,
      reconciliationStatus: status,
      asOf: this.clock.nowIso(),
    };
  }

  async get(liabilityId: string) {
    return this.serialize(await this.require(liabilityId));
  }

  /** List all loyalty-stablecoin liabilities (trustee proof-of-reserve view). */
  async listLiabilities() {
    const rows = await this.prisma.paykhLoyaltyLiability.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { liabilities: rows.map((l) => this.serialize(l)) };
  }

  /** Resolve a requested amount from either token `units` or backing minor units. */
  private resolveAmount(liability: Liability, amountMinor?: string, unitsStr?: string) {
    if (unitsStr !== undefined && unitsStr !== null && unitsStr !== '') {
      const units = BigInt(unitsStr);
      const peg = makePeg(liability.pegCurrency, liability.denominationMinor);
      return { amount: backingForUnits(units, peg), units };
    }
    if (amountMinor !== undefined && amountMinor !== null && amountMinor !== '') {
      return { amount: money(BigInt(amountMinor), liability.pegCurrency), units: undefined };
    }
    throw new BadRequestException('Provide either units or amountMinor');
  }

  /**
   * Sign the authorization and delegate on-chain execution to PayChain. Returns
   * a normalized result; when there is no on-chain binding it is treated as an
   * off-chain issuance (trustee ledger only).
   */
  private async authorizeOnChain(
    operation: 'ISSUE' | 'BURN',
    liability: Liability,
    amountMinor: string,
  ): Promise<{
    status: string;
    executedBy: 'paychain' | 'offchain' | 'simulated';
    paychainReference?: string;
    onChainTxHash?: string;
  }> {
    if (!liability.stellarAssetCode || !liability.stellarDistributor) {
      return { status: 'OFFCHAIN', executedBy: 'offchain' };
    }
    const reference = `paykh-loyalty-${operation.toLowerCase()}:${liability.id}:${randomUUID()}`;
    const artifact = {
      operation,
      assetCode: liability.stellarAssetCode,
      destination: liability.stellarDistributor,
      amountMinor,
      currency: liability.pegCurrency,
      reference,
    };
    const sig = this.signing.sign(SigningPurpose.MINT_AUTHORIZATION, artifact);
    const req = {
      authorizationId: reference,
      assetCode: liability.stellarAssetCode,
      destination: liability.stellarDistributor,
      amountMinor,
      decimals: liability.decimals,
      currency: liability.pegCurrency,
      reference,
      signature: { keyId: sig.keyId, alg: 'ed25519', value: sig.value },
    };
    const res =
      operation === 'ISSUE'
        ? await this.gateway.requestIssue(req)
        : await this.gateway.requestBurn(req);
    return {
      status: res.simulated ? 'ONCHAIN_SIMULATED' : res.accepted ? 'ONCHAIN_CONFIRMED' : 'ONCHAIN_FAILED',
      executedBy: res.simulated ? 'simulated' : 'paychain',
      paychainReference: res.paychainReference,
      onChainTxHash: res.onChainTxHash,
    };
  }

  private async require(liabilityId: string) {
    const l = await this.prisma.paykhLoyaltyLiability.findUnique({ where: { id: liabilityId } });
    if (!l) throw new NotFoundException(`Loyalty liability ${liabilityId} not found`);
    return l;
  }

  private serialize(l: Liability) {
    return {
      id: l.id,
      tenantId: l.tenantId,
      paykhProgramId: l.paykhProgramId,
      programFundId: l.programFundId,
      classification: l.classification,
      currency: l.currency,
      pegCurrency: l.pegCurrency,
      denominationMinor: l.denominationMinor.toString(),
      decimals: l.decimals,
      stellar: l.stellarAssetCode
        ? { assetCode: l.stellarAssetCode, issuer: l.stellarIssuer, distributor: l.stellarDistributor }
        : null,
      outstandingMinor: l.outstandingMinor.toString(),
      issuedTotalMinor: l.issuedTotalMinor.toString(),
      redeemedTotalMinor: l.redeemedTotalMinor.toString(),
      onChainSupplyMinor: l.onChainSupplyMinor.toString(),
      reconciliationStatus: l.reconciliationStatus,
      status: l.status,
    };
  }
}
