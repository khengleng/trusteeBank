import { Module } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { OperationsController } from './operations.controller';
import { ReserveModule } from '../reserve/reserve.module';
import { PaykhModule } from '../paykh/paykh.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReserveModule, PaykhModule, ReconciliationModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
