# Integration-Gap Report (Initial)

changeforpaychainandpaykh §1 requires inspecting the existing PayChain and PayKH
codebases before integration coding. **Those codebases are not present in this
repository** (`trustee.cambobia.com` is a standalone project). This report
therefore records the *assumed* integration contract the trustee platform is
built against and the concrete questions the PayChain/PayKH teams must confirm.

## Method

The trustee platform isolates itself behind adapters
(`packages/adapters`): `PayChainAdapter`, `PayKHAdapter`, `TrusteeBankAdapter`,
`KHQRProviderAdapter`, `ComplianceProviderAdapter`. If the existing systems
already expose equivalent endpoints, the HTTP adapters point at them; only
missing endpoints need to be added on their side (§4/§5). No direct DB access.

## What the trustee platform needs FROM the existing systems

### PayChain
- `GET  .../assets/{assetId}/supply` — independent circulating supply for reserve
  reconciliation (consumed by `PayChainAdapter.getAssetSupply`).
- Ability to **receive** signed trustee webhooks at a registered URL
  (`ClientApplication.webhookUrl`) for: `reserve.snapshot.created`,
  `reserve.shortfall.detected`, `mint.authorization.approved/rejected/expired`,
  `mint.confirmed`, `redemption.*`, `program.suspended`.
- To **submit** signed liability snapshots to `POST /api/v1/paychain/liability-snapshots`.
- Registered **public key** so the platform verifies those snapshots (§15).

### PayKH
- Ability to **receive** signed trustee webhooks for `paykh.payment.*`,
  `paykh.payment-profile.*`, `paykh.program-fund.*`, `paykh.settlement.*`,
  `paykh.tenant.suspended`.
- To **call** `/api/v1/paykh/*` for payment profiles, orders, KHQR, program funds
  and settlements.

## Open questions to confirm (blocking for production)

1. Exact PayChain supply endpoint shape and auth model (OAuth client credentials? mTLS?).
2. PayChain liability-snapshot signing key + rotation process.
3. PayKH webhook receiver path and signature-verification support.
4. Shared correlation-ID propagation across `PayKH → Trustee → PayChain` and
   `PayChain → Trustee → Bank` (changeforpaychainandpaykh §10).
5. KHQR/Bakong provider for production payment-reference issuance (pilot derives
   references locally).
6. Trustee-bank core-banking integration mode (API/ESB/ISO 20022/statement).

## Shared correlation identifiers (implemented as pass-through fields)

`correlation_id, external_reference, tenant_id, program_id, payment_order_id,
funding_instruction_id, deposit_id, mint_request_id, mint_authorization_id,
redemption_id, settlement_id, asset_id, bank_transaction_id`.
