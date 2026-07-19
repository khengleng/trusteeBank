import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SigningService } from './signing.service';
import { FeatureFlagsService } from './feature-flags.service';
import { AuditService } from './audit.service';
import { IdempotencyService } from './idempotency.service';
import { ClockService } from './clock.service';
import { ClientAuthService } from './client-auth.service';
import { NotificationService } from './notification.service';
import { UserAuthService } from './user-auth.service';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';
import { IssuanceGatewayService } from './issuance-gateway.service';
import { BankBalanceService } from './bank-balance.service';

/**
 * Cross-cutting infrastructure shared by every feature module: database,
 * signing, feature flags, audit trail, idempotency and the injectable clock.
 * Global so feature modules need not re-import it.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    SigningService,
    FeatureFlagsService,
    AuditService,
    IdempotencyService,
    ClockService,
    ClientAuthService,
    NotificationService,
    UserAuthService,
    RedisService,
    RateLimitService,
    IssuanceGatewayService,
    BankBalanceService,
  ],
  exports: [
    PrismaService,
    SigningService,
    FeatureFlagsService,
    AuditService,
    IdempotencyService,
    ClockService,
    ClientAuthService,
    NotificationService,
    UserAuthService,
    RedisService,
    RateLimitService,
    IssuanceGatewayService,
    BankBalanceService,
  ],
})
export class InfraModule {}
