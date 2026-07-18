import { Module } from '@nestjs/common';
import { PaykhController } from './paykh.controller';
import { PaymentProfilesService } from './payment-profiles.service';
import { PaymentOrdersService } from './payment-orders.service';
import { ProgramFundsService } from './program-funds.service';
import { SettlementsService } from './settlements.service';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [PaykhController],
  providers: [
    PaymentProfilesService,
    PaymentOrdersService,
    ProgramFundsService,
    SettlementsService,
  ],
  exports: [PaymentOrdersService, ProgramFundsService],
})
export class PaykhModule {}
