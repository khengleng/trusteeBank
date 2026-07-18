import {
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

/** §13 Funding instruction creation payload. Amounts are minor-unit strings. */
export class CreateFundingInstructionDto {
  @IsString() @IsNotEmpty() programId!: string;
  @IsString() @IsNotEmpty() paychainRequestId!: string;
  @IsString() @IsNotEmpty() assetId!: string;
  @IsString() @IsNotEmpty() depositor!: string;
  @IsOptional() @IsString() expectedPayer?: string;
  @IsString() @IsNotEmpty() beneficiaryAccountId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @IsNotEmpty() permittedMethod!: string;
  @IsOptional() @IsInt() @IsPositive() ttlSeconds?: number;
  @IsString() @IsNotEmpty() actor!: string;
}
