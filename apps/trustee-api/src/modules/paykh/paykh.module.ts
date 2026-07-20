import { Module } from '@nestjs/common';
import { PaykhController } from './paykh.controller';
import { PaymentProfilesService } from './payment-profiles.service';
import { PaymentOrdersService } from './payment-orders.service';
import { ProgramFundsService } from './program-funds.service';
import { SettlementsService } from './settlements.service';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyBankController } from './loyalty-bank.controller';
import { MerchantsService } from './merchants.service';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [PaykhController, LoyaltyBankController],
  providers: [
    PaymentProfilesService,
    PaymentOrdersService,
    ProgramFundsService,
    SettlementsService,
    LoyaltyService,
    MerchantsService,
  ],
  exports: [
    PaymentOrdersService,
    ProgramFundsService,
    SettlementsService,
    LoyaltyService,
    MerchantsService,
  ],
})
export class PaykhModule {}
