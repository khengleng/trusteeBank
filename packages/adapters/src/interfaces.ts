/**
 * Adapter interfaces isolating the Trustee Platform from the existing, already
 * deployed PayChain and PayKH systems and from the trustee bank's core banking
 * (changeforpaychainandpaykh §3-§5). The platform integrates via versioned REST
 * APIs and signed webhooks — never direct database access (§13 non-negotiable).
 */

export interface IntegrationHealth {
  healthy: boolean;
  detail?: string;
}

export interface DeliveryResult {
  delivered: boolean;
  statusCode?: number;
  attempt: number;
  error?: string;
}

/** Fields every outbound integration request/webhook carries (§8, domain config). */
export interface SignedEnvelope {
  // Stripe-style aliases (id/type) alongside the trustee-native eventId/eventType.
  id: string;
  type: string;
  eventId: string;
  eventType: string;
  eventSequence: string;
  targetPlatform: string;
  timestamp: string;
  clientId: string;
  programId?: string;
  correlationId: string;
  requestId: string;
  nonce: string;
  bodyHash: string;
  signingKeyId: string;
  // String for envelope-only events; an object {keyId,alg,value} for
  // artifact-bearing events (trustee-events-contract inner signature).
  signature: string | { keyId: string; alg: string; value: string };
  apiVersion: string;
  payload: Record<string, unknown>;
  // Inner signed artifact (string) + when it occurred, for artifact-bearing events.
  artifact?: string;
  occurredAt?: string;
  // Optional request-style signature (§28 subject) for header-based verifiers.
  requestSignature?: string;
  timestampMs?: string;
}

// --- PayChain adapter (§4) --------------------------------------------------

export interface AssetSupply {
  assetId: string;
  circulatingMinor: string;
  currency: string;
  ledgerReference: string;
}

export interface PayChainAdapter {
  getAssetSupply(assetId: string): Promise<AssetSupply>;
  submitSignedEvent(envelope: SignedEnvelope): Promise<DeliveryResult>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- PayKH adapter (§5) -----------------------------------------------------

export interface PayKHAdapter {
  submitSignedEvent(envelope: SignedEnvelope): Promise<DeliveryResult>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- Trustee bank / core banking adapter (§11 of base spec) -----------------

export interface BankAccountBalance {
  accountRef: string;
  clearedMinor: string;
  currency: string;
  asOf: string;
}

export interface TrusteeBankAdapter {
  getAccountBalance(accountRef: string): Promise<BankAccountBalance>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- KHQR provider adapter --------------------------------------------------

export interface KhqrPaymentRef {
  reference: string;
  khqrString: string;
}

export interface KHQRProviderAdapter {
  createPaymentReference(input: {
    recipientPayload: string;
    amountMinor: string;
    currency: string;
  }): Promise<KhqrPaymentRef>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- Stellar on-chain issuance adapter (update §23) -------------------------
// The backed loyalty stablecoin is issued on the Stellar network. The trustee
// issues (mints) on customer issuance and burns/claws back on redemption, and
// independently reads the on-chain circulating supply to reconcile it against
// the trustee's own loyalty-stablecoin liability. All amounts cross this
// boundary as minor-unit decimal strings + a `decimals` scale; the adapter does
// the minor <-> Stellar 7-decimal conversion internally.

export interface StellarAssetRef {
  assetCode: string;
  /** G... issuing account. */
  issuer: string;
  /** Minor-unit decimal places of the pegged currency (e.g. 2 for USD/KHR). */
  decimals: number;
}

export interface StellarSupply {
  assetCode: string;
  issuer: string;
  /** Total issued (circulating) supply in minor units. */
  circulatingMinor: string;
  decimals: number;
  /** Horizon paging cursor / ledger reference for the read. */
  ledgerReference: string;
  asOf: string;
}

export interface StellarTxResult {
  hash: string;
  ledger?: number;
  successful: boolean;
}

export interface StellarIssueRequest {
  assetCode: string;
  /** G... recipient (PayKH custodial distribution account for the customer). */
  destination: string;
  amountMinor: string;
  decimals: number;
}

export interface StellarBurnRequest {
  assetCode: string;
  /** G... holder account the redeemed amount is clawed back from. */
  from: string;
  amountMinor: string;
  decimals: number;
}

export interface StellarIssuanceAdapter {
  /** Issue (mint) `amountMinor` of the asset to a destination account. */
  issue(req: StellarIssueRequest): Promise<StellarTxResult>;
  /** Burn / claw back `amountMinor` of the asset from a holder (redemption). */
  burn(req: StellarBurnRequest): Promise<StellarTxResult>;
  /** Independently read the on-chain circulating supply of the asset. */
  getSupply(asset: StellarAssetRef): Promise<StellarSupply>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- PayChain issuance gateway (update §23) ---------------------------------
// On-chain issuance is executed by PayChain (the issuer of record that holds the
// Stellar keys), NEVER by the trustee. The trustee authorizes an issuance/burn
// and asks PayChain to execute it via this REST boundary; PayChain performs the
// on-chain mint/clawback on Stellar and returns the tx reference. The trustee
// then independently reads Horizon (StellarIssuanceAdapter.getSupply) to verify.
// If PayChain has not yet built this endpoint, the contract below is the spec it
// must implement; until then the trustee runs in a flagged simulation mode.

export interface IssuanceExecutionRequest {
  /** Trustee authorization id backing this on-chain action. */
  authorizationId: string;
  operation: 'ISSUE' | 'BURN';
  assetCode: string;
  /** Holder / distribution account (G...) to mint to or burn from. */
  destination: string;
  amountMinor: string;
  decimals: number;
  currency: string;
  /** Trustee-side idempotency reference (safe to retry). */
  reference: string;
  /** The trustee's signed authorization artifact PayChain verifies before minting. */
  signature?: { keyId: string; alg: string; value: string };
}

export interface IssuanceExecutionResult {
  accepted: boolean;
  /** ACCEPTED | EXECUTED | PENDING | REJECTED */
  status: string;
  paychainReference?: string;
  onChainTxHash?: string;
  detail?: string;
}

export interface PayChainIssuanceAdapter {
  /** Ask PayChain to execute an on-chain issuance/burn on Stellar. */
  execute(req: IssuanceExecutionRequest): Promise<IssuanceExecutionResult>;
  healthCheck(): Promise<IntegrationHealth>;
}

// --- Compliance provider adapter (§25 base spec) ----------------------------

export interface ScreeningResult {
  cleared: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  caseId?: string;
}

export interface ComplianceProviderAdapter {
  screenPerson(input: { fullName: string; country?: string }): Promise<ScreeningResult>;
  screenDeposit(input: { payerName?: string; amountMinor: string; currency: string }): Promise<ScreeningResult>;
  healthCheck(): Promise<IntegrationHealth>;
}
