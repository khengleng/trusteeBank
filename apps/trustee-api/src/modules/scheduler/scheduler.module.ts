import { Module } from '@nestjs/common';
import { ReserveModule } from '../reserve/reserve.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { SchedulerService } from './scheduler.service';

/**
 * Recurring operational jobs (proof-of-reserve, reconciliation, alerting).
 * Infra services (Prisma, Redis, Notification, Clock) come from the global
 * InfraModule; reserve + reconciliation logic is reused from their modules.
 */
@Module({
  imports: [ReserveModule, ReconciliationModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
