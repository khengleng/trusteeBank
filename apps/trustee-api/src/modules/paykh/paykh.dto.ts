import {
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';
import { FundClassification } from '@trustee/domain';

export class SubmitPaymentProfileDto {
  // tenantId comes from the URL path, not the body.
  @IsString() @IsNotEmpty() recipientName!: string;
  @IsString() @IsNotEmpty() recipientAccountMasked!: string;
  @IsString() @IsNotEmpty() bankName!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @IsNotEmpty() khqrPayload!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class ActorDto {
  @IsString() @IsNotEmpty() actor!: string;
}

export class SuspendDto {
  @IsString() @IsNotEmpty() actor!: string;
  @IsString() @IsNotEmpty() reason!: string;
}

export class CreatePaymentOrderDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() profileId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsInt() @IsPositive() ttlSeconds?: number;
  @IsString() @IsNotEmpty() actor!: string;
}

export class CheckPaymentDto {
  @IsString() @IsNotEmpty() bankTransactionId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @IsNotEmpty() paymentReference!: string;
  @IsString() @IsNotEmpty() recipientAccountMasked!: string;
  @IsString() @IsNotEmpty() reserveAccountId!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class CreateProgramFundDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() paykhProgramId!: string;
  @IsString() @IsNotEmpty() classification!: FundClassification;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @IsNotEmpty() reserveAccountId!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class FundAmountDto {
  @IsNumberString() amountMinor!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class CreateSettlementDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() merchantId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class ApproveSettlementDto {
  @IsString() @IsNotEmpty() checkerId!: string;
}
