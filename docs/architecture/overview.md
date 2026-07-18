# Architecture Overview

## Position in the ecosystem

```
Customers / Merchants / Tenants / Partners
        |                         |
        v                         v
 paykh.cambobia.com        paychain.cambobia.com     (existing, unchanged)
        |  why value moves        |  how digital value issued
        +-----------+-------------+
                    v
        api.trustee.cambobia.com   (THIS platform — trustee.cambobia.com)
             /api/v1/paykh  /api/v1/paychain  /api/v1/bank
                    |  whether real bank money exists & may back it
                    v
      Trustee bank core banking / payment switch / KHQR   (via adapters)
```

The trustee platform is standalone. It never reads or writes the PayChain/PayKH
databases; coordination is via authenticated APIs and signed events
(changeforpaychainandpaykh §13).

## Modular monolith + workers

`trustee-api` (NestJS) is a modular monolith exposing three namespaces, guarded
by client separation:

- `/api/v1/paychain` — funding, reserves, mint authorization/confirmation,
  liability-snapshot intake, proof-of-reserve. PayChain credentials only.
- `/api/v1/paykh` — payment profiles, KHQR payment orders + matching, program
  funds, merchant settlement. PayKH credentials only.
- `/api/v1/bank` — bank-detected deposit registration/matching/clearance.
  Trustee-bank systems only (private connectivity/mTLS/IP allowlist).
- `/api/v1/trustee` — shared program registry and liability registry.

`trustee-worker` delivers signed events from the transactional outbox to each
client's registered webhook with retries and dead-lettering.

## Domain packages (pure, testable)

- **domain** — `Money` as bigint minor units (no floats), enums, and the
  fund-classification engine (whether a liability needs fiat backing).
- **ledger** — immutable double-entry journal engine; every entry balances to
  zero; corrections are compensating entries; account effects respect normal
  balance side. Entry templates for deposit clearance, mint reservation,
  redemption and PayKH collection/settlement/program funding.
- **reserves** — eligible-reserve (§16), reserve obligation, reserve ratio, mint
  capacity (§17), and the **mint guard**: a pure decision returning every reason
  a mint is blocked (insufficient capacity, stale data, unresolved reconciliation,
  compliance hold, deposits not cleared, approval incomplete, feature disabled…).
- **cryptography** — Ed25519 sign/verify over canonical JSON, SHA-256 hashing.

## Reserve accounting model

| Event | Ledger effect | Reserve-position effect |
|-------|---------------|-------------------------|
| Deposit detected | `Dr CASH / Cr UNMATCHED_DEPOSIT` | not yet eligible |
| Deposit cleared  | `Dr UNMATCHED_DEPOSIT / Cr RESERVE_OBLIGATION` | eligible reserve ↑ |
| Mint authorized  | `Dr RESERVE_OBLIGATION / Cr PENDING_MINT` | mint capacity ↓ (earmarked) |
| Mint confirmed   | `Dr PENDING_MINT / Cr RESERVE_OBLIGATION` | realized vs. circulating supply |
| Mint expired/revoked | reverse the reservation | capacity restored |

`Eligible Reserve = cleared cash − unmatched − pending payouts − holds …`
`Mint Capacity = eligible − obligation − safety buffer − pending mints`,
clamped at zero. Obligation's circulating-supply component comes from the
independently-verified PayChain liability feed (§15).

## Critical acceptance paths

- **PayChain (§31):** funding instruction → deposit detected/matched/cleared →
  reserve ↑ → maker requests mint → checker approves (guard re-evaluated) →
  signed single-use authorization → mint confirmation → reserve/supply reconcile
  → signed reserve snapshot.
- **PayKH (§30):** tenant payment profile submitted → trustee verifies/activates
  → payment order + KHQR reference → bank transaction matched (amount/currency/
  recipient/reference, duplicate-safe) → signed `paykh.payment.confirmed` →
  program-fund reservation for reward funding.

See [end-to-end walkthrough](../paychain-integration/end-to-end.md).
