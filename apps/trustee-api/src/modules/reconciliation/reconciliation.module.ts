import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import {
  PaychainReconciliationController,
  PaykhReconciliationController,
} from './reconciliation.controller';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [PaychainReconciliationController, PaykhReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
