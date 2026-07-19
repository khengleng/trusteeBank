# Trustee signed-event contract (what the trustee must emit)

This is the contract PayChain **verifies and enforces** for trustee → PayChain events. The webhook
transport (headers, envelope signature, idempotency, replay window) is defined in
[`API-CONTRACT.md`](../paychain-integration/API-CONTRACT.md); this document adds the **inner signed
artifacts** that let PayChain act on authorizations and reserve evidence — not just log them.

## Two layers of signature

1. **Envelope** — the whole POST body is Ed25519-signed with the trustee's `WEBHOOK` key
   (`X-Trustee-Signature` over `` `${X-Trustee-Timestamp}.${body}` ``). Already live.
2. **Inner artifact** — authorization/evidence events additionally carry an artifact signed by a
   **purpose-specific** key, so a compromised webhook key cannot forge a mint authorization or a
   reserve figure. This is what this phase adds.

PayChain fetches all keys from the trustee JWKS at
`https://api.trustee.cambobia.com/.well-known/trustee-signing-keys` (configurable via
`TRUSTEE_JWKS_URL`), keyed by `purpose` + `keyId`, and verifies each artifact with the key named in
its own `signature.keyId`.

## Event body shape (artifact-bearing events)

```json
{
  "type": "mint.authorization.approved",
  "id": "evt_...",
  "occurredAt": "2026-07-19T00:25:28.000Z",
  "artifact": "<exact JSON string the trustee signed>",
  "signature": { "keyId": "mint_authorization-v1", "alg": "ed25519", "value": "<base64>" }
}
```

- **`artifact` is a string** — the exact bytes the trustee signed. `signature.value` =
  `base64(Ed25519(purposeKey, artifactBytes))`. PayChain verifies over the raw `artifact` string,
  then `JSON.parse`s it. Do **not** re-serialize between signing and sending — byte differences fail
  verification (same discipline as the webhook envelope's raw body).
- `signature.value` may be base64 or hex; base64 is preferred.

### Purpose-key routing

| Event type prefix | Signature key `purpose` | e.g. keyId |
| --- | --- | --- |
| `mint.authorization.*` | `MINT_AUTHORIZATION` | `mint_authorization-v1` |
| `reserve.snapshot.*` | `RESERVE_SNAPSHOT` | `reserve_snapshot-v1` |
| `attestation.*` | `ATTESTATION` | `attestation-v1` |

Events without an inner artifact (e.g. `mint.confirmed`, `deposit.*`) are accepted on the envelope
signature alone and recorded; they need no `artifact`/`signature` block.

## Artifacts PayChain acts on

### `mint.authorization.approved` — gates a mint

Parsed `artifact` fields (all required unless noted):

| Field | Meaning |
| --- | --- |
| `authorizationId` | Trustee's unique id for this authorization (dedup key). |
| `reference` | **The PayChain `StablecoinMintRequest.id` being authorized.** This is how PayChain matches an authorization to a specific pending mint. |
| `tenantId` | PayChain tenant id. |
| `assetId` | PayChain asset id. |
| `amount` | Authorized amount (string), must equal the mint request amount. |
| `destination` | Destination wallet id, must equal the mint request's. |
| `expiresAt` | Optional ISO-8601; PayChain rejects an expired authorization. |

**Enforcement:** when `stablecoin.trustee_authorization.required` is enabled for a tenant, PayChain
will not mint unless a `VALID`, unexpired authorization exists whose `reference`, `assetId`,
`amount`, and `destination` all match the mint request. Each authorization is **single-use**
(consumed on mint). A failed mint requires a fresh authorization.

> **Handshake:** PayChain provides the `reference` (its mint-request id) when it asks the trustee to
> authorize a mint. Whether that ask is an API call PayChain makes to the trustee, or the trustee
> already has the id, the returned `mint.authorization.approved` **must echo `reference` exactly**.

### `reserve.snapshot.created` — corroborates reserve for minting

Parsed `artifact` fields:

| Field | Meaning |
| --- | --- |
| `snapshotId` | Trustee's snapshot id. |
| `tenantId` / `assetId` | PayChain tenant/asset. |
| `reserveBalance` | The trustee-attested reserve figure (real bank money the trustee verified). |
| `currency` | Optional (e.g. `USD`). |
| `asOf` | Optional ISO-8601 timestamp of the figure. |

**Effect:** PayChain records this as a reserve snapshot with `source='trustee'` and the signature as
evidence. A fresh trustee snapshot satisfies the mint **freshness** requirement (§23) — the trustee
becomes the corroborating reserve source.

## Verification / rejection behavior

| Condition | PayChain response |
| --- | --- |
| Valid envelope + valid inner artifact | `200`, event acted on + recorded |
| Missing `artifact`/`signature` on an artifact-bearing event | `400` |
| Inner `signature.keyId` not in the JWKS (after one refresh) | `401` |
| Inner signature does not verify | `401`, nothing recorded |
| Envelope failures (bad sig, stale ts, unknown webhook key) | as in `API-CONTRACT.md` |

All failures are fail-closed: a rejected event is neither recorded nor acted on, and the trustee's
delivery worker will retry/dead-letter it (safe — PayChain dedups on `X-Trustee-Delivery`).

## Summary for the trustee team

1. Keep the JWKS current (it already publishes `mint_authorization-v1`, `reserve_snapshot-v1`, etc.).
2. For `mint.authorization.approved` and `reserve.snapshot.created`, include the `artifact` string +
   `signature` block, signed by the matching purpose key.
3. `mint.authorization.approved.artifact.reference` **must be the PayChain mint-request id** being
   authorized, and `assetId`/`amount`/`destination` must match that request.

In short:

- On `mint.authorization.approved` and `reserve.snapshot.created`, include an artifact string +
  signature block signed by the matching purpose key.
- The mint authorization's `artifact.reference` must be the PayChain mint-request id it authorizes,
  with `assetId`/`amount`/`destination` matching that request.

---

## Trustee implementation status (this repo)

**Implemented.** The trustee emits both artifact-bearing events exactly as above:

- The delivered POST body for `mint.authorization.approved` and `reserve.snapshot.created` carries a
  top-level `artifact` (string) + `signature` object `{keyId, alg:"ed25519", value}` alongside
  `type`, `id`, `occurredAt`.
- `mint.authorization.approved.artifact` = `{authorizationId, reference, tenantId, assetId, amount,
  destination, expiresAt}` where **`reference` is the PayChain `paychainRequestId`** supplied when the
  mint was requested, and `amount`/`destination`/`assetId` are the values PayChain sent. Signed by
  `MINT_AUTHORIZATION` (`mint_authorization-v1`).
- `reserve.snapshot.created.artifact` = `{snapshotId, tenantId, assetId, reserveBalance, currency,
  asOf}`, `reserveBalance` = the trustee-attested eligible reserve. Signed by `RESERVE_SNAPSHOT`
  (`reserve_snapshot-v1`).
- The artifact `signature.value` is `base64(Ed25519(purposeKey, artifactBytes))` over the **exact
  `artifact` string** delivered (canonical JSON: keys sorted recursively, no insignificant
  whitespace) — verify over the raw string, then `JSON.parse`.

**PayChain must supply** `tenantId` and `destination` when requesting a mint
(`POST /api/v1/paychain/mint-authorizations`) so the authorization artifact can echo them; `reference`
is the existing `paychainRequestId`.
