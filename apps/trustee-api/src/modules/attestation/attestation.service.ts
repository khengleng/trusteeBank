import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SigningPurpose, sha256Hex } from '@trustee/cryptography';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { SigningService } from '../../infra/signing.service';
import { ReserveService } from '../reserve/reserve.service';

export interface CreateAttestation {
  programId?: string;
  period: string;
  scope: string;
  methodology?: string;
  reserveAmountMinor?: string;
  liabilityAmountMinor?: string;
  currency?: string;
  opinion?: string;
  auditor: string;
  documentHash?: string;
  actor: string;
}

/**
 * Attestation management (§23). Lifecycle DRAFT → UNDER_REVIEW → APPROVED →
 * PUBLISHED. Published attestations are retrievable as signed artifacts (the
 * ATTESTATION signing key), so PayChain, PayKH and auditors can consume signed
 * outputs and verify them against /.well-known/trustee-signing-keys.
 */
@Injectable()
export class AttestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly signing: SigningService,
    private readonly reserve: ReserveService,
  ) {}

  async create(input: CreateAttestation) {
    // Derive reserve/liability amounts from the live ledger position when a
    // program is given and the caller did not supply them, so an attestation
    // reflects the trustee's books rather than free-text input (§23).
    let reserveAmountMinor = input.reserveAmountMinor ? BigInt(input.reserveAmountMinor) : null;
    let liabilityAmountMinor = input.liabilityAmountMinor ? BigInt(input.liabilityAmountMinor) : null;
    let currency = input.currency ?? null;
    let derivedFromLedger = false;
    if (input.programId && (reserveAmountMinor === null || liabilityAmountMinor === null)) {
      const pos = await this.reserve.position(input.programId);
      reserveAmountMinor = reserveAmountMinor ?? pos.eligibleReserve.minor;
      liabilityAmountMinor = liabilityAmountMinor ?? pos.reserveObligation.minor;
      currency = currency ?? pos.currency;
      derivedFromLedger = true;
    }
    const a = await this.prisma.attestation.create({
      data: {
        programId: input.programId ?? null,
        period: input.period,
        scope: input.scope,
        methodology: input.methodology ?? null,
        reserveAmountMinor,
        liabilityAmountMinor,
        currency,
        opinion: input.opinion ?? null,
        auditor: input.auditor,
        documentHash: input.documentHash ?? null,
        status: 'DRAFT',
        createdBy: input.actor,
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'attestation.created',
      subjectType: 'ATTESTATION',
      subjectId: a.id,
      afterState: { derivedFromLedger },
    });
    return { id: a.id, status: a.status, derivedFromLedger };
  }

  async transition(id: string, to: 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'WITHDRAWN', actor: string) {
    const a = await this.require(id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['UNDER_REVIEW', 'WITHDRAWN'],
      UNDER_REVIEW: ['APPROVED', 'WITHDRAWN'],
      APPROVED: ['PUBLISHED', 'WITHDRAWN'],
      PUBLISHED: ['WITHDRAWN'],
    };
    if (!(allowed[a.status] ?? []).includes(to)) {
      throw new BadRequestException(`Cannot transition attestation from ${a.status} to ${to}`);
    }
    const updated = await this.prisma.attestation.update({
      where: { id },
      data: {
        status: to,
        approvedBy: to === 'APPROVED' ? actor : a.approvedBy,
        issueDate: to === 'PUBLISHED' ? this.clock.now() : a.issueDate,
      },
    });
    await this.audit.record({ actor, action: `attestation.${to.toLowerCase()}`, subjectType: 'ATTESTATION', subjectId: id });
    return { id, status: updated.status };
  }

  /** Retrieve an attestation. Published ones include a live signature. */
  async get(id: string) {
    const a = await this.require(id);
    const content = {
      attestationId: a.id,
      programId: a.programId,
      period: a.period,
      scope: a.scope,
      reserveAmountMinor: a.reserveAmountMinor?.toString() ?? null,
      liabilityAmountMinor: a.liabilityAmountMinor?.toString() ?? null,
      currency: a.currency,
      opinion: a.opinion,
      auditor: a.auditor,
      documentHash: a.documentHash,
      status: a.status,
      issueDate: a.issueDate?.toISOString() ?? null,
    };
    const base = { ...content, contentHash: sha256Hex(JSON.stringify(content)) };
    if (a.status !== 'PUBLISHED') return base;
    const signature = this.signing.sign(SigningPurpose.ATTESTATION, content);
    return { ...base, signature };
  }

  async list(programId?: string) {
    const attestations = await this.prisma.attestation.findMany({
      where: programId ? { programId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { id: true, period: true, scope: true, status: true, auditor: true, programId: true },
    });
    return { attestations };
  }

  private async require(id: string) {
    const a = await this.prisma.attestation.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Attestation ${id} not found`);
    return a;
  }
}
