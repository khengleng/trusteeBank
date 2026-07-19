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
