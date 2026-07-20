import { call, type Creds, type HttpResult } from '../http';
import type { AuditConfig } from '../config';

/** Typed trustee API client. Uses the right client-credential set per namespace. */
export class TrusteeClient {
  private bank: Creds;
  private paychain: Creds;
  constructor(private readonly cfg: AuditConfig) {
    this.bank = { base: cfg.trusteeBase, clientId: cfg.trusteeBankId, clientSecret: cfg.trusteeBankSecret };
    this.paychain = { base: cfg.trusteeBase, clientId: cfg.paychainId, clientSecret: cfg.paychainSecret };
  }

  health(): Promise<HttpResult> {
    return call({ base: this.cfg.trusteeBase }, 'GET', '/health');
  }
  jwks(): Promise<HttpResult> {
    return call({ base: this.cfg.trusteeBase }, 'GET', '/.well-known/trustee-signing-keys');
  }
  reserveCurrent(programId: string): Promise<HttpResult> {
    return call(this.paychain, 'GET', `/api/v1/paychain/reserves/${programId}/current`);
  }
  createPor(programId: string): Promise<HttpResult> {
    return call(this.paychain, 'POST', `/api/v1/paychain/proof-of-reserve/${programId}/snapshots`);
  }
  latestPor(programId: string): Promise<HttpResult> {
    return call(this.paychain, 'GET', `/api/v1/paychain/proof-of-reserve/${programId}/latest`);
  }
  loyaltyList(): Promise<HttpResult> {
    return call(this.bank, 'GET', '/api/v1/bank/loyalty-liabilities');
  }
  loyaltyReconcile(id: string): Promise<HttpResult> {
    return call(this.bank, 'POST', `/api/v1/bank/loyalty-liabilities/${id}/reconcile`);
  }
  bankReconcile(programId: string): Promise<HttpResult> {
    return call(this.bank, 'POST', `/api/v1/bank/reserves/${programId}/bank-reconcile`);
  }
  trialBalance(programId: string): Promise<HttpResult> {
    return call(this.bank, 'GET', `/api/v1/admin/ledger/${programId}/trial-balance`);
  }
  audit(limit = 50): Promise<HttpResult> {
    return call(this.bank, 'GET', `/api/v1/admin/audit?limit=${limit}`);
  }
  /** Control C-06: post an UNSIGNED liability snapshot — should be rejected when enforced. */
  postUnsignedLiability(programId: string): Promise<HttpResult> {
    return call(this.paychain, 'POST', '/api/v1/paychain/liability-snapshots', {
      programId, assetId: 'AUDIT', assetCode: 'AUDIT', blockchainNetwork: 'stellar-testnet',
      issuerAccount: 'G_AUDIT', circulatingMinor: '1', treasuryHeldMinor: '0', lockedMinor: '0',
      pendingMintMinor: '0', pendingBurnMinor: '0', pendingRedemptionMinor: '0', confirmedBurnMinor: '0',
      effectiveLiabilityMinor: '1', currency: 'USD', ledgerReference: 'audit', sourceVersion: 'audit',
      sequence: String(Date.now()), snapshotTimestamp: new Date(0).toISOString(),
    });
  }
}
