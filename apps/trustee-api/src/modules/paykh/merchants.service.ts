import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';

export interface RegisterMerchantInput {
  tenantId: string;
  merchantCode: string;
  legalName: string;
  country?: string;
  // Reported by PayKH (the KYC/onboarding system of record).
  paykhMerchantRef?: string;
  kycStatus?: string; // PENDING | VERIFIED | REJECTED
  status?: string; // ACTIVE | SUSPENDED | CLOSED
  riskLevel?: string;
  actor: string;
}

/**
 * PayKH merchant registry mirror (update §25).
 *
 * PayKH owns merchant onboarding and KYC. This service does NOT run KYC — it
 * mirrors what PayKH registers/reports so the trustee can enforce referential
 * integrity: settlements and loyalty redemptions may only target a merchant that
 * PayKH has registered and reported as ACTIVE + KYC-VERIFIED. Registration is an
 * idempotent upsert keyed by (tenantId, merchantCode).
 */
@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
  ) {}

  /** PayKH registers (or re-reports) a merchant it has onboarded. */
  async register(input: RegisterMerchantInput) {
    const key = { tenantId_merchantCode: { tenantId: input.tenantId, merchantCode: input.merchantCode } };
    const data = {
      legalName: input.legalName,
      country: input.country ?? null,
      paykhMerchantRef: input.paykhMerchantRef ?? null,
      kycStatus: input.kycStatus ?? 'PENDING',
      status: input.status ?? 'ACTIVE',
      riskLevel: input.riskLevel ?? 'LOW',
      lastReportedAt: this.clock.now(),
    };
    const merchant = await this.prisma.paykhMerchant.upsert({
      where: key,
      update: data,
      create: { tenantId: input.tenantId, merchantCode: input.merchantCode, source: 'PAYKH', ...data },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.merchant.registered',
      subjectType: 'PAYKH_MERCHANT',
      subjectId: merchant.id,
      afterState: { kycStatus: merchant.kycStatus, status: merchant.status },
    });
    return this.serialize(merchant);
  }

  /** PayKH updates the reported KYC/lifecycle status of a merchant. */
  async updateStatus(id: string, input: { kycStatus?: string; status?: string; riskLevel?: string; actor: string }) {
    const m = await this.require(id);
    const updated = await this.prisma.paykhMerchant.update({
      where: { id },
      data: {
        kycStatus: input.kycStatus ?? m.kycStatus,
        status: input.status ?? m.status,
        riskLevel: input.riskLevel ?? m.riskLevel,
        lastReportedAt: this.clock.now(),
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.merchant.status_updated',
      subjectType: 'PAYKH_MERCHANT',
      subjectId: id,
      afterState: { kycStatus: updated.kycStatus, status: updated.status },
    });
    return this.serialize(updated);
  }

  async get(id: string) {
    return this.serialize(await this.require(id));
  }

  async listByTenant(tenantId: string) {
    const rows = await this.prisma.paykhMerchant.findMany({ where: { tenantId } });
    return { merchants: rows.map((m) => this.serialize(m)) };
  }

  /**
   * Assert a merchant is usable for settlement / redemption: registered by
   * PayKH, ACTIVE, and KYC-VERIFIED. Accepts the trustee mirror id.
   */
  async requireActive(merchantId: string) {
    const m = await this.prisma.paykhMerchant.findUnique({ where: { id: merchantId } });
    if (!m) throw new NotFoundException(`Merchant ${merchantId} is not registered by PayKH (§25)`);
    if (m.status !== 'ACTIVE') {
      throw new BadRequestException(`Merchant ${merchantId} is ${m.status}, not ACTIVE (per PayKH)`);
    }
    if (m.kycStatus !== 'VERIFIED') {
      throw new BadRequestException(`Merchant ${merchantId} KYC is ${m.kycStatus}, not VERIFIED (per PayKH)`);
    }
    return m;
  }

  private async require(id: string) {
    const m = await this.prisma.paykhMerchant.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`Merchant ${id} not found`);
    return m;
  }

  private serialize(m: {
    id: string; tenantId: string; merchantCode: string; paykhMerchantRef: string | null;
    legalName: string; country: string | null; kycStatus: string; riskLevel: string;
    status: string; source: string;
  }) {
    return {
      id: m.id,
      tenantId: m.tenantId,
      merchantCode: m.merchantCode,
      paykhMerchantRef: m.paykhMerchantRef,
      legalName: m.legalName,
      country: m.country,
      kycStatus: m.kycStatus,
      riskLevel: m.riskLevel,
      status: m.status,
      source: m.source,
    };
  }
}
