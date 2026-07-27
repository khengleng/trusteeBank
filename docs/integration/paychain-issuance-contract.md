# PayChain on-chain issuance contract (trustee → PayChain)

The trustee bank is the **reserve authority** and does **not** hold Stellar
issuing keys. On-chain issuance and redemption of a backed loyalty stablecoin
are **executed by PayChain** (the issuer of record). The trustee:

1. Holds the fiat reserve and enforces full 1:1 backing.
2. **Authorizes** an issuance/burn and signs it (Ed25519, purpose `MINT_AUTHORIZATION`).
3. Calls the endpoint below asking PayChain to execute it on Stellar.
4. Independently reads Stellar Horizon (read-only) to reconcile on-chain supply
   against its own reserve liability (proof of reserve).

If PayChain has not built this endpoint yet, this is the spec to implement. Until
it exists, the trustee runs issuance in a clearly-flagged **simulation** mode
(`PAYCHAIN_ISSUANCE_URL` unset) — the trustee ledger is authoritative and fully
reserved; only the on-chain leg is deferred.

## Endpoint

```
POST {PAYCHAIN_ISSUANCE_URL}/api/v1/trustee/issuance/execute
Headers:
  content-type: application/json
  x-api-version: v1
  x-idempotency-key: <reference>       # safe to retry
  authorization: Bearer <token>        # optional
Body (IssuanceExecutionRequest):
{
  "authorizationId": "paykh-loyalty-issue:<liabilityId>:<uuid>",
  "operation": "ISSUE" | "BURN",
  "assetCode": "mUSD",
  "destination": "G...",               # distribution/holder account
  "amountMinor": "12000",
  "decimals": 2,
  "currency": "USD",
  "reference": "paykh-loyalty-issue:<liabilityId>:<uuid>",
  "signature": { "keyId": "mint_authorization-v1", "alg": "ed25519", "value": "<base64>" }
}
```

PayChain MUST verify `signature` over the canonical authorization artifact using
the trustee's published key (`GET /.well-known/trustee-signing-keys`, purpose
`MINT_AUTHORIZATION`) before minting/burning. `ISSUE` mints `amountMinor` of the
asset to `destination`; `BURN` claws back / burns `amountMinor` from it.

## Response

```
200 OK (IssuanceExecutionResult):
{
  "accepted": true,
  "status": "EXECUTED" | "ACCEPTED" | "PENDING" | "REJECTED",
  "paychainReference": "pc_tx_...",
  "onChainTxHash": "<stellar tx hash>",
  "detail": "..."                      # optional
}
```

## Reconciliation

The trustee reads on-chain supply independently:

```
GET {STELLAR_HORIZON_URL}/assets?asset_code=mUSD&asset_issuer=G...
```

and flags `DRIFT` when the circulating supply disagrees with the trustee's
loyalty-stablecoin ledger balance. This closes the loop: PayChain executes,
the trustee proves.

`reconciliationStatus` is one of:

| Status | Meaning |
|---|---|
| `OK` | Every figure agreed — chain read, ledger, and the liability's running counter. |
| `DRIFT` | A proven mismatch: on-chain vs ledger, the counter vs ledger, or backing below outstanding. Raises an open `ReconciliationException`, which blocks further issuance until resolved. |
| `UNVERIFIED` | The asset is bound on-chain but Horizon could not be read this run. **Not** a pass: an unreadable chain is an absence of evidence, not evidence of parity. |
| `PENDING` | Never reconciled. |

`onChainSupplyMinor` is `null` unless a figure was actually read from Horizon —
it is never back-filled from the ledger, since doing so would manufacture the
very agreement the check exists to test.
