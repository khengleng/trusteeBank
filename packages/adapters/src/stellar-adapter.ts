/**
 * Stellar Horizon adapter (update §23).
 *
 * Trust model (IMPORTANT): the trustee does NOT hold the on-chain issuing keys.
 * On-chain issuance/redemption is executed by PayChain (the issuer of record) —
 * see {@link PayChainIssuanceAdapter}. The trustee uses this adapter READ-ONLY,
 * via {@link HorizonStellarAdapter.getSupply}, to independently verify the
 * on-chain circulating supply against its own reserve liability (proof of
 * reserve). The write operations (`issue`/`burn`) are provided only for a
 * key-holding issuer (PayChain-side / tests) and require `issuerSecret`; they
 * throw when the trustee runs without a secret, by design.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type {
  IntegrationHealth,
  StellarAssetRef,
  StellarBurnRequest,
  StellarIssuanceAdapter,
  StellarIssueRequest,
  StellarSupply,
  StellarTxResult,
} from './interfaces';

export interface HorizonStellarConfig {
  horizonUrl: string;
  /** Required only for write ops (issue/burn); the trustee reads supply only. */
  networkPassphrase?: string;
  /** S... secret of the issuing account. Absent for read-only (trustee) use. */
  issuerSecret?: string;
  /** Optional transaction timeout in seconds (default 180). */
  timeoutSeconds?: number;
}

/** Convert integer minor units to a Stellar decimal amount string (≤7 dp). */
export function minorToStellarAmount(minor: bigint, decimals: number): string {
  if (decimals < 0 || decimals > 7) {
    throw new Error(`Unsupported decimals ${decimals} for Stellar amount (max 7)`);
  }
  const neg = minor < 0n;
  const digits = (neg ? -minor : minor).toString().padStart(decimals + 1, '0');
  const cut = digits.length - decimals;
  const intPart = digits.slice(0, cut);
  const fracPart = decimals > 0 ? '.' + digits.slice(cut) : '';
  return (neg ? '-' : '') + intPart + fracPart;
}

/** Convert a Stellar decimal amount string back to integer minor units. */
export function stellarAmountToMinor(amount: string, decimals: number): bigint {
  const neg = amount.trim().startsWith('-');
  const [intRaw, fracRaw = ''] = amount.replace('-', '').split('.');
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
  const scaled = BigInt(intRaw || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0');
  return neg ? -scaled : scaled;
}

export class HorizonStellarAdapter implements StellarIssuanceAdapter {
  private readonly server: Horizon.Server;
  private readonly issuer: Keypair | null;
  private readonly timeout: number;

  constructor(private readonly config: HorizonStellarConfig) {
    this.server = new Horizon.Server(config.horizonUrl);
    this.issuer = config.issuerSecret ? Keypair.fromSecret(config.issuerSecret) : null;
    this.timeout = config.timeoutSeconds ?? 180;
  }

  /** The issuing account's public key (G...), if a secret is configured. */
  issuerPublicKey(): string | null {
    return this.issuer?.publicKey() ?? null;
  }

  private requireIssuer(): { key: Keypair; network: string } {
    if (!this.issuer || !this.config.networkPassphrase) {
      throw new Error(
        'On-chain issuance is executed by PayChain (issuer of record); the trustee holds no issuing key. issue/burn require issuerSecret + networkPassphrase.',
      );
    }
    return { key: this.issuer, network: this.config.networkPassphrase };
  }

  async issue(req: StellarIssueRequest): Promise<StellarTxResult> {
    const { key, network } = this.requireIssuer();
    const asset = new Asset(req.assetCode, key.publicKey());
    const amount = minorToStellarAmount(BigInt(req.amountMinor), req.decimals);
    const account = await this.server.loadAccount(key.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: network })
      .addOperation(Operation.payment({ destination: req.destination, asset, amount }))
      .setTimeout(this.timeout)
      .build();
    tx.sign(key);
    const res = await this.server.submitTransaction(tx);
    return { hash: res.hash, ledger: res.ledger, successful: res.successful };
  }

  async burn(req: StellarBurnRequest): Promise<StellarTxResult> {
    const { key, network } = this.requireIssuer();
    const asset = new Asset(req.assetCode, key.publicKey());
    const amount = minorToStellarAmount(BigInt(req.amountMinor), req.decimals);
    const account = await this.server.loadAccount(key.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: network })
      .addOperation(Operation.clawback({ asset, from: req.from, amount }))
      .setTimeout(this.timeout)
      .build();
    tx.sign(key);
    const res = await this.server.submitTransaction(tx);
    return { hash: res.hash, ledger: res.ledger, successful: res.successful };
  }

  async getSupply(asset: StellarAssetRef): Promise<StellarSupply> {
    const page = await this.server
      .assets()
      .forCode(asset.assetCode)
      .forIssuer(asset.issuer)
      .limit(1)
      .call();
    const record = page.records[0];
    // Circulating supply = everything held outside the issuer: trustline
    // balances (authorized + maintain-liabilities + unauthorized) plus value in
    // claimable balances, liquidity pools and Soroban contracts.
    let circulatingMinor = '0';
    if (record) {
      const parts = [
        record.balances.authorized,
        record.balances.authorized_to_maintain_liabilities,
        record.balances.unauthorized,
        record.claimable_balances_amount,
        record.liquidity_pools_amount,
        record.contracts_amount,
      ];
      const total = parts.reduce(
        (acc, a) => acc + stellarAmountToMinor(a ?? '0', asset.decimals),
        0n,
      );
      circulatingMinor = total.toString();
    }
    return {
      assetCode: asset.assetCode,
      issuer: asset.issuer,
      circulatingMinor,
      decimals: asset.decimals,
      ledgerReference: record?.paging_token ?? '',
      asOf: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    try {
      await this.server.ledgers().order('desc').limit(1).call();
      return { healthy: true };
    } catch (err) {
      return { healthy: false, detail: (err as Error).message };
    }
  }
}
