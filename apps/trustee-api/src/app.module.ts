import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { InfraModule } from './infra/infra.module';
import { EventsModule } from './events/events.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { FundingModule } from './modules/funding/funding.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { ReserveModule } from './modules/reserve/reserve.module';
import { LiabilityModule } from './modules/liability/liability.module';
import { MintModule } from './modules/mint/mint.module';
import { RedemptionModule } from './modules/redemption/redemption.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AttestationModule } from './modules/attestation/attestation.module';
import { PaykhModule } from './modules/paykh/paykh.module';
import { RegistryModule } from './modules/registry/registry.module';
import { AdminModule } from './modules/admin/admin.module';
import { OperationsModule } from './modules/operations/operations.module';
import { PortalModule } from './modules/portal/portal.module';
import { SystemModule } from './modules/system/system.module';
import { ClientSeparationGuard } from './common/client-separation.guard';
import { RequestSignatureGuard } from './common/request-signature.guard';
import { RateLimitGuard } from './common/rate-limit.guard';
import { PermissionGuard } from './common/permission.guard';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    InfraModule,
    EventsModule,
    SystemModule,
    PortalModule,
    AuthModule,
    ProgramsModule,
    RegistryModule,
    AdminModule,
    OperationsModule,
    // PayChain client
    FundingModule,
    DepositsModule,
    ReserveModule,
    LiabilityModule,
    MintModule,
    RedemptionModule,
    ReconciliationModule,
    AttestationModule,
    // PayKH client
    PaykhModule,
  ],
  providers: [
    // Order matters: authenticate + attach principal, verify request signature,
    // apply per-client rate limits, then enforce RBAC.
    { provide: APP_GUARD, useClass: ClientSeparationGuard },
    { provide: APP_GUARD, useClass: RequestSignatureGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
