import { HorizonStellarAdapter } from '@trustee/adapters';

/**
 * Independently read on-chain circulating supply from Stellar Horizon (read-only,
 * no keys) — the auditor does not trust PayChain's reported supply, it reads the
 * chain itself. Reuses the trustee's own Horizon adapter for identical semantics.
 */
export async function readOnChainSupplyMinor(
  horizonUrl: string,
  assetCode: string,
  issuer: string,
  decimals: number,
): Promise<{ ok: boolean; circulatingMinor?: string; note: string }> {
  try {
    const adapter = new HorizonStellarAdapter({ horizonUrl });
    const supply = await adapter.getSupply({ assetCode, issuer, decimals });
    return { ok: true, circulatingMinor: supply.circulatingMinor, note: `read ${assetCode}:${issuer.slice(0, 6)}… on ${horizonUrl}` };
  } catch (err) {
    return { ok: false, note: (err as Error).message };
  }
}
