import { Module } from '@nestjs/common';
import { AttestationService } from './attestation.service';
import {
  PaychainAttestationController,
  PaykhAttestationController,
  TrusteeAttestationController,
} from './attestation.controller';

@Module({
  controllers: [
    PaychainAttestationController,
    PaykhAttestationController,
    TrusteeAttestationController,
  ],
  providers: [AttestationService],
  exports: [AttestationService],
})
export class AttestationModule {}
