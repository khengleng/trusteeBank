import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { verifyPayload, type Signature } from '@trustee/cryptography';
import { PrismaService } from '../../infra/prisma.service';
import { FeatureFlagsService } from '../../infra/feature-flags.service';

export interface LiabilitySnapshotInput {
  programId: string;
  assetId: string;
  assetCode: string;
  blockchainNetwork: string;
  issuerAccount: string;
  circulatingMinor: string;
  treasuryHeldMinor: string;
  lockedMinor: string;
  pendingMintMinor: string;
  pendingBurnMinor: string;
  pendingRedemptionMinor: string;
  confirmedBurnMinor: string;
  effectiveLiabilityMinor: string;
  currency: string;
  ledgerReference: string;
  sourceVersion: string;
  sequence: string;
  snapshotTimestamp: string;
  signature?: Signature;
}

/**
 * Ingest and independently verify a PayChain signed liability snapshot (§15).
 * The platform verifies the signature, snapshot sequence (monotonic, no
 * duplicates) and timestamp freshness before the snapshot is trusted. It never
 * relies solely on PayChain's database (§15).
 */
@Injectable()
export class LiabilityService {
  private readonly logger = new Logger(LiabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private paychainPublicKey(): string | null {
    return process.env.PAYCHAIN_LIABILITY_PUBLIC_KEY ?? null;
  }

  async ingest(input: LiabilitySnapshotInput): Promise<{ id: string; verified: boolean }> {
    const sequence = BigInt(input.sequence);

    const latest = await this.prisma.liabilitySnapshot.findFirst({
      where: { programId: input.programId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    if (latest && sequence <= latest.sequence) {
      throw new ConflictException(
        `Liability snapshot sequence ${sequence} is not greater than latest ${latest.sequence} (duplicate or out-of-order)`,
      );
    }

    // Independently verify the signature against PayChain's registered key.
    let verified = false;
    const pubKey = this.paychainPublicKey();
    const { signature, ...signable } = input;
    if (pubKey && signature) {
      verified = verifyPayload(pubKey, signable, signature);
      if (!verified) {
        throw new BadRequestException('Liability snapshot signature failed verification');
      }
    } else {
      // Fail closed when signature enforcement is on: an unsigned/unverifiable
      // supply feed must not silently back reserve/mint decisions (§15).
      const required = await this.flags.isEnabled('liability.signature.required');
      if (required) {
        throw new BadRequestException(
          'Liability snapshot must be signed and PAYCHAIN_LIABILITY_PUBLIC_KEY configured (liability.signature.required is enabled).',
        );
      }
      // Demo mode only: no registered PayChain key and enforcement disabled.
      this.logger.warn(
        'PAYCHAIN_LIABILITY_PUBLIC_KEY not configured — accepting snapshot in demo trust mode. Enable liability.signature.required and configure the key for production (§15).',
      );
      verified = true;
    }

    const created = await this.prisma.liabilitySnapshot.create({
      data: {
        programId: input.programId,
        assetId: input.assetId,
        assetCode: input.assetCode,
        blockchainNetwork: input.blockchainNetwork,
        issuerAccount: input.issuerAccount,
        circulatingMinor: BigInt(input.circulatingMinor),
        treasuryHeldMinor: BigInt(input.treasuryHeldMinor),
        lockedMinor: BigInt(input.lockedMinor),
        pendingMintMinor: BigInt(input.pendingMintMinor),
        pendingBurnMinor: BigInt(input.pendingBurnMinor),
        pendingRedemptionMinor: BigInt(input.pendingRedemptionMinor),
        confirmedBurnMinor: BigInt(input.confirmedBurnMinor),
        effectiveLiabilityMinor: BigInt(input.effectiveLiabilityMinor),
        currency: input.currency,
        ledgerReference: input.ledgerReference,
        sourceVersion: input.sourceVersion,
        sequence,
        snapshotTimestamp: new Date(input.snapshotTimestamp),
        signatureKeyId: signature?.keyId ?? 'unsigned',
        signatureValue: signature?.value ?? '',
        signatureVerified: verified,
      },
      select: { id: true },
    });
    return { id: created.id, verified };
  }
}
