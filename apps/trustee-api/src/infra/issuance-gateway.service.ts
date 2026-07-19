import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  HorizonStellarAdapter,
  HttpPayChainIssuanceAdapter,
  type IssuanceExecutionRequest,
  type IssuanceExecutionResult,
  type PayChainIssuanceAdapter,
  type StellarIssuanceAdapter,
} from '@trustee/adapters';

export interface RequestIssuanceInput {
  authorizationId: string;
  assetCode: string;
  destination: string;
  amountMinor: string;
  decimals: number;
  currency: string;
  reference: string;
  signature?: { keyId: string; alg: string; value: string };
}

/**
 * Issuance gateway (update §23). On-chain issuance/redemption is EXECUTED BY
 * PAYCHAIN (the issuer of record that holds the Stellar keys) — the trustee only
 * authorizes it and delegates execution here, then independently verifies the
 * result by reading Horizon read-only. The trustee never holds issuing keys.
 *
 * - `PAYCHAIN_ISSUANCE_URL` set  -> live: POST signed requests to PayChain.
 * - unset                        -> SIMULATION: deterministic pseudo-references,
 *   no external call (dev/CI), clearly flagged `simulated: true`.
 * - `STELLAR_HORIZON_URL` set    -> read-only on-chain supply verification.
 */
@Injectable()
export class IssuanceGatewayService {
  private readonly logger = new Logger(IssuanceGatewayService.name);
  private readonly paychain: PayChainIssuanceAdapter | null;
  private readonly horizon: StellarIssuanceAdapter | null;
  readonly liveExecution: boolean;
  readonly onChainVerification: boolean;

  constructor() {
    const issuanceUrl = process.env.PAYCHAIN_ISSUANCE_URL;
    if (issuanceUrl) {
      this.paychain = new HttpPayChainIssuanceAdapter({
        baseUrl: issuanceUrl,
        apiVersion: process.env.PAYCHAIN_API_VERSION ?? 'v1',
        authToken: process.env.PAYCHAIN_ISSUANCE_TOKEN,
      });
      this.liveExecution = true;
    } else {
      this.paychain = null;
      this.liveExecution = false;
      this.logger.warn(
        'PAYCHAIN_ISSUANCE_URL not set — on-chain issuance runs in SIMULATION mode (no PayChain call). Configure it so PayChain executes the Stellar mint/burn (§23).',
      );
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL;
    if (horizonUrl) {
      // Read-only: no issuer secret — the trustee only verifies supply.
      this.horizon = new HorizonStellarAdapter({ horizonUrl });
      this.onChainVerification = true;
    } else {
      this.horizon = null;
      this.onChainVerification = false;
    }
  }

  /** Ask PayChain to mint the asset on Stellar (the trustee has authorized it). */
  async requestIssue(input: RequestIssuanceInput) {
    return this.execute({ ...input, operation: 'ISSUE' });
  }

  /** Ask PayChain to burn/claw back the asset on Stellar (redemption). */
  async requestBurn(input: RequestIssuanceInput) {
    return this.execute({ ...input, operation: 'BURN' });
  }

  private async execute(
    req: Omit<IssuanceExecutionRequest, 'operation'> & { operation: 'ISSUE' | 'BURN' },
  ): Promise<IssuanceExecutionResult & { simulated: boolean }> {
    if (!this.paychain) {
      const ref =
        'sim:' +
        createHash('sha256')
          .update(`${req.operation}:${req.reference}:${req.amountMinor}`)
          .digest('hex')
          .slice(0, 40);
      return { accepted: true, status: 'SIMULATED', paychainReference: ref, simulated: true };
    }
    const res = await this.paychain.execute(req);
    return { ...res, simulated: false };
  }

  /** Independently read on-chain circulating supply for reconciliation. */
  async readOnChainSupply(input: { assetCode: string; issuer: string; decimals: number }) {
    if (!this.horizon) return null;
    return this.horizon.getSupply(input);
  }
}
