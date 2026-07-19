import { Module } from '@nestjs/common';
import { AttestationService } from './attestation.service';
import {
  PaychainAttestationController,
  PaykhAttestationController,
  TrusteeAttestationController,
} from './attestation.controller';
import { ReserveModule } from '../reserve/reserve.module';

@Module({
  imports: [ReserveModule],
  controllers: [
    PaychainAttestationController,
    PaykhAttestationController,
    TrusteeAttestationController,
  ],
  providers: [AttestationService],
  exports: [AttestationService],
})
export class AttestationModule {}
