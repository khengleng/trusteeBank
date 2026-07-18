import {
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class RegisterDepositDto {
  @IsString() @IsNotEmpty() programId!: string;
  @IsString() @IsNotEmpty() trusteeAccountId!: string;
  @IsString() @IsNotEmpty() bankTransactionId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsString() payerName?: string;
  @IsOptional() @IsString() paymentReference?: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class MatchDepositDto {
  @IsString() @IsNotEmpty() fundingInstructionId!: string;
  @IsString() @IsNotEmpty() actor!: string;
}

export class ClearDepositDto {
  @IsString() @IsNotEmpty() actor!: string;
}
