import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class RequestMintAuthorizationDto {
  @IsString() @IsNotEmpty() programId!: string;
  @IsString() @IsNotEmpty() paychainRequestId!: string;
  @IsNumberString() amountMinor!: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) fundingDepositIds!: string[];
}

export class ReviewMintDto {
  @IsString() @IsNotEmpty() makerId!: string;
}

export class ApproveMintDto {
  @IsString() @IsNotEmpty() checkerId!: string;
  @IsString() @IsNotEmpty() reason!: string;
}

export class RevokeMintDto {
  @IsString() @IsNotEmpty() actor!: string;
  @IsString() @IsNotEmpty() reason!: string;
}

export class ConfirmMintDto {
  @IsString() @IsNotEmpty() paychainTransactionId!: string;
  @IsString() @IsNotEmpty() blockchainTxHash!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @IsNotEmpty() destination!: string;
  @IsOptional() @IsNumberString() ledgerHeight?: string;
  @IsDateString() confirmedAt!: string;
  @IsString() @IsNotEmpty() paychainSignature!: string;
  @IsString() @IsNotEmpty() actor!: string;
}
