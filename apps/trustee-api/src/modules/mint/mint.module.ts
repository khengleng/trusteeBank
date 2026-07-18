import { Module } from '@nestjs/common';
import { MintService } from './mint.service';
import { MintController, TrusteeMintController } from './mint.controller';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [MintController, TrusteeMintController],
  providers: [MintService],
  exports: [MintService],
})
export class MintModule {}
