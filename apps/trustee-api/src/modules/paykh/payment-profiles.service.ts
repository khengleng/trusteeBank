import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../../infra/audit.service';
import { ClockService } from '../../infra/clock.service';
import { EventsService, PaykhEvent } from '../../events/events.service';

export interface SubmitPaymentProfile {
  tenantId: string;
  recipientName: string;
  recipientAccountMasked: string;
  bankName: string;
  currency: string;
  khqrPayload: string;
  actor: string;
}

/**
 * PayKH tenant payment profiles (update §13/§14). A tenant's KHQR recipient is
 * recorded, then verified against the trustee bank before it can receive
 * payment orders. Ownership is never assumed from the QR alone (update §14).
 */
@Injectable()
export class PaymentProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly events: EventsService,
  ) {}

  async submit(input: SubmitPaymentProfile) {
    if (!input.khqrPayload.trim()) {
      throw new BadRequestException('KHQR payload is required');
    }
    const profile = await this.prisma.paykhPaymentProfile.create({
      data: {
        tenantId: input.tenantId,
        recipientName: input.recipientName,
        recipientAccountMasked: input.recipientAccountMasked,
        bankName: input.bankName,
        currency: input.currency,
        khqrPayload: input.khqrPayload,
        status: 'SUBMITTED',
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.payment_profile.submitted',
      subjectType: 'PAYKH_PAYMENT_PROFILE',
      subjectId: profile.id,
    });
    return { id: profile.id, status: profile.status };
  }

  /** Trustee-bank verification of recipient account ownership. */
  async verify(profileId: string, actor: string) {
    const profile = await this.require(profileId);
    if (profile.status !== 'SUBMITTED' && profile.status !== 'VERIFYING') {
      throw new BadRequestException(`Profile cannot be verified from ${profile.status}`);
    }
    const updated = await this.prisma.paykhPaymentProfile.update({
      where: { id: profileId },
      data: { status: 'APPROVED', verifiedAt: this.clock.now() },
    });
    await this.audit.record({
      actor,
      action: 'paykh.payment_profile.verified',
      subjectType: 'PAYKH_PAYMENT_PROFILE',
      subjectId: profileId,
      afterState: { status: updated.status },
    });
    await this.events.publishToPaykh(PaykhEvent.PROFILE_VERIFIED, {
      profileId,
      tenantId: profile.tenantId,
    });
    return { id: profileId, status: updated.status };
  }

  async activate(profileId: string, actor: string) {
    const profile = await this.require(profileId);
    if (profile.status !== 'APPROVED') {
      throw new BadRequestException('Profile must be APPROVED before activation');
    }
    const updated = await this.prisma.paykhPaymentProfile.update({
      where: { id: profileId },
      data: { status: 'ACTIVE' },
    });
    await this.audit.record({
      actor,
      action: 'paykh.payment_profile.activated',
      subjectType: 'PAYKH_PAYMENT_PROFILE',
      subjectId: profileId,
    });
    return { id: profileId, status: updated.status };
  }

  async suspend(profileId: string, actor: string, reason: string) {
    await this.require(profileId);
    const updated = await this.prisma.paykhPaymentProfile.update({
      where: { id: profileId },
      data: { status: 'SUSPENDED' },
    });
    await this.audit.record({
      actor,
      action: 'paykh.payment_profile.suspended',
      subjectType: 'PAYKH_PAYMENT_PROFILE',
      subjectId: profileId,
      reason,
    });
    await this.events.publishToPaykh(PaykhEvent.PROFILE_SUSPENDED, { profileId });
    return { id: profileId, status: updated.status };
  }

  async get(profileId: string) {
    const p = await this.require(profileId);
    return {
      id: p.id, tenantId: p.tenantId, status: p.status, recipientName: p.recipientName,
      recipientAccountMasked: p.recipientAccountMasked, bankName: p.bankName, currency: p.currency,
    };
  }

  async listByTenant(tenantId: string) {
    const profiles = await this.prisma.paykhPaymentProfile.findMany({
      where: { tenantId },
      select: { id: true, status: true, recipientName: true, bankName: true, currency: true },
    });
    return { profiles };
  }

  private async require(profileId: string) {
    const p = await this.prisma.paykhPaymentProfile.findUnique({ where: { id: profileId } });
    if (!p) throw new NotFoundException(`Payment profile ${profileId} not found`);
    return p;
  }
}
