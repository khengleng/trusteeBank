import { Module } from '@nestjs/common';
import { RedemptionService } from './redemption.service';
import { RedemptionController, TrusteeRedemptionController } from './redemption.controller';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [RedemptionController, TrusteeRedemptionController],
  providers: [RedemptionService],
  exports: [RedemptionService],
})
export class RedemptionModule {}
