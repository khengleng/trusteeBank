import { Module } from '@nestjs/common';
import { ReserveService } from './reserve.service';
import { ReserveLedgerService } from './reserve-ledger.service';
import { ReserveController } from './reserve.controller';
import { ReserveBankController } from './reserve-bank.controller';

@Module({
  controllers: [ReserveController, ReserveBankController],
  providers: [ReserveService, ReserveLedgerService],
  exports: [ReserveService, ReserveLedgerService],
})
export class ReserveModule {}
