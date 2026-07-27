# End-to-End Regulator-Readiness Test Plan — PayKH · PayChain · Trustee

| | |
|---|---|
| **Owner** | Trustee Internal Audit |
| **Version** | 1.0 (2026-07-20) |
| **Status** | Draft for team sign-off |
| **Purpose** | Automated, repeatable end-to-end assurance across the three platforms, capturing tamper-evident proof of platform readiness for a regulator visit. |
| **Audience** | Regulator (evidence pack); PayKH, PayChain and Trustee engineering; Trustee compliance. |

The guiding principle is **independent verification**: the trustee does not accept
any platform's assertion at face value. Every reserve, supply and authorization
figure is either (a) signed and verified against the trustee's published keys, or
(b) read directly from the source of truth (Stellar Horizon, the double-entry
ledger, the bank), then cross-checked. A test only passes when the *independent*
check agrees.

---

## 1. Systems under test & trust boundaries

| Platform | Responsibility (in scope) | Not its job |
|---|---|---|
| **PayKH** | Merchant onboarding + KYC; customer purchase; local loyalty points; KHQR payment orders; merchant settlement. | On-chain, reserves. |
| **PayChain** | Stablecoin issuer of record: on-chain wallet creation, mint (`/assets/{id}/earn`), burn/redeem, and the signed liability (circulating-supply) feed. | Merchant KYC, holding reserves. |
| **Trustee** | Safeguarding + reserve control; double-entry ledger; signed proof-of-reserve; mint authorization (maker/checker); multi-bank reconciliation; **independent** verification of on-chain supply and of each platform's signed artifacts. | Minting tokens, onboarding merchants. |

**Environment:** Stellar **testnet** (`horizon-testnet.stellar.org`). All money in
**integer minor units**. All timestamps UTC.

**Key endpoints (trustee, verified):**
`GET /.well-known/trustee-signing-keys` (JWKS) · `GET /api/v1/paychain/reserves/{programId}/current` ·
`POST /api/v1/paychain/proof-of-reserve/{programId}/snapshots` · `POST /api/v1/paychain/liability-snapshots` ·
`POST /api/v1/paychain/mint-authorizations` (+ `bank/.../review|approve`) · `POST /api/v1/paychain/redemptions` (+ burn/payout) ·
`GET /api/v1/bank/loyalty-liabilities` (+ `/{id}/reconcile`) · `POST /api/v1/bank/reserves/{programId}/bank-reconcile` ·
`GET /api/v1/admin/audit` · `POST /api/v1/admin/reconciliations/reserve` ·
`GET /api/v1/paychain/reconciliation-exceptions` (+ `/{id}/resolve`).
PayKH/PayChain endpoints are consumed per their published contracts.

---

## 2. Regulatory control objectives → test traceability

| # | Control objective (regulator concern) | Verified by |
|---|---|---|
| CO-1 | Customer funds are **safeguarded** in trustee-held reserve accounts | E2E-01 S5, C-08 |
| CO-2 | Issued value is **fully backed 1:1** by cleared reserve at all times | E2E-01 S5–S7, C-01, C-09 |
| CO-3 | **Proof of reserve** is signed, independently verifiable, and current | E2E-01 S6, C-07 |
| CO-4 | On-chain circulating supply **equals** the trustee-recorded liability | E2E-01 S7, C-05 |
| CO-5 | **Segregation of duties** on value-moving approvals | C-02 |
| CO-6 | **KYC/merchant integrity** — value only flows to onboarded, verified merchants | C-03 |
| CO-7 | Complete, immutable **audit trail** of every state change | E2E-01 (all), evidence pack |
| CO-8 | Ledger is **double-entry and always in balance** | E2E-01 S5, C-09 |
| CO-9 | **Idempotency / no double-processing** of payments & mints | C-04 |
| CO-10 | Reserve **shortfall / drift is detected and blocks** further issuance | C-01, C-05 |

**How drift blocks issuance.** Detection and blocking are one mechanism, not two:
every detector (reserve reconciliation, bank-vs-ledger, on-chain-vs-ledger) writes
an open `ReconciliationException`. The mint guard treats *any* open exception on
the program as `RECONCILIATION_UNRESOLVED` and refuses to authorize (§17, §49
"when uncertain: stop minting"). Issuance resumes only when an operator resolves
the exception via `POST /api/v1/paychain/reconciliation-exceptions/{id}/resolve`
with an actor and a reason — an audited act that closes the exception without
altering any figure; a genuine mismatch is corrected by a compensating entry
(§14). C-05 therefore asserts the open exception, not merely the flag.
| CO-11 | Inter-platform messages are **cryptographically signed** and verified | C-06, C-07 |

Every test below cites the control objective(s) it evidences.

---

## 3. Preconditions & test data

1. All three platforms deployed to the shared test environment; trustee on **testnet**.
2. A trustee **program** exists (e.g. `PUSD-TEST`) with an **ACTIVE** trustee reserve account, linked to a **bank connection** (MOCK acceptable for the pilot).
3. The stablecoin asset is **registered** at the trustee (`LiabilityRegistryEntry`) and a loyalty stablecoin **bound** with its **Stellar asset code + issuer G-address** — otherwise on-chain verification has nothing to resolve.
4. PayChain's **liability-feed signing public key** is registered at the trustee (`PAYCHAIN_LIABILITY_PUBLIC_KEY`), and `liability.signature.required` is **on** (so the feed is verified, not demo-trusted).
5. Test merchant, test customer, and API credentials for each platform are provisioned. Reserve is pre-funded to a known amount `R0`.
6. Clocks are NTP-synced across platforms (signature freshness windows).

Any unmet precondition is a **blocking gate** and is reported as `NOT_READY`, not a test failure.

---

## 4. Test scenarios

### 4.1 E2E-01 — Happy path (purchase → points → mint → reserve → proof → verify)

One customer purchase of **KHR 40,000** drives the full chain. Each stage asserts a
result **and** captures evidence.

| Stage | Action (platform) | Pass criteria | Evidence captured | CO |
|---|---|---|---|---|
| S1 | Customer purchase KHR 40,000 → paid (PayKH) | Order `CONFIRMED`; one bank txn matched | PayKH order record + `payment.confirmed` event | CO-6, CO-9 |
| S2 | Award local loyalty points (PayKH) | Points credited to customer; PayKH points-ledger entry | PayKH points ledger row | CO-7 |
| S3 | Create on-chain wallet (PayChain) | Wallet `WALLET_CREATED`, confirmed on testnet | Stellar tx hash; Horizon lookup confirms account | CO-4 |
| S4 | Mint stablecoin `POST /assets/{id}/earn` (PayChain) | HTTP 2xx; mint tx confirmed on testnet | PayChain mint receipt + **Stellar tx hash** | CO-2, CO-4 |
| S5 | Reserve & ledger posture (Trustee) | `reserveRatioBps ≥ 10000`; **ledger in balance = true**; obligation reflects new mint | `GET reserves/{prog}/current`; ledger trial balance | CO-1, CO-2, CO-8 |
| S6 | Proof-of-reserve snapshot (Trustee) | Signed `RESERVE_SNAPSHOT`; `reconciliationStatus=OK`; surplus ≥ 0 | Signed snapshot JSON + `signature{keyId,value}` | CO-3 |
| S7 | **Independent on-chain verification** (Trustee) | Trustee reads testnet Horizon; **on-chain circulating == ledger liability**; loyalty reconcile `status=OK` (no DRIFT). An unreadable chain yields `UNVERIFIED`, never `OK` — the on-chain figure is stored only when actually observed | `POST loyalty-liabilities/{id}/reconcile` result + Horizon read | CO-4, CO-10 |
| S8 | Signature verification (Auditor harness) | Every signed artifact (S6, mint auth, attestation) verifies against the **JWKS**; `keyId` matches purpose | Verification log (per artifact: keyId, alg, PASS) | CO-3, CO-11 |
| S9 | Attestation (Trustee) | Attestation created with amounts **derived from the ledger**, published + signed | Signed attestation artifact | CO-3 |

**Invariant checked continuously through E2E-01:** `eligible_reserve ≥ circulating_liability`
(full reserve) — asserted after S4, S5, S7.

### 4.2 Control tests (assurance / negative — these demonstrate the controls *work*)

| ID | Control test | Setup | Expected (PASS = control fires) | CO |
|---|---|---|---|---|
| C-01 | **Under-reserve blocks mint** | Request mint > available reserve capacity | Trustee mint-guard rejects (`INSUFFICIENT_CAPACITY`); no authorization issued | CO-2, CO-10 |
| C-02 | **Self-approval blocked (SoD)** | Same operator acts maker then checker on a mint authorization | HTTP 403 (`§9` self-approval) | CO-5 |
| C-03 | **Unverified merchant blocked** | Settle / redeem to a merchant with KYC ≠ VERIFIED or status ≠ ACTIVE | Rejected: "KYC is …, not VERIFIED" | CO-6 |
| C-04 | **Idempotent payment & mint** | Re-POST same `bankTransactionId` / same `Idempotency-Key` | Second call returns the first result / 409 duplicate; **no double credit** | CO-9 |
| C-05 | **Drift detection** | Set on-chain supply ≠ ledger liability (or a bank balance ≠ ledger cash) | Both arms asserted independently: the auditor reads Horizon itself and re-adds the per-bank breakdown itself, then requires the trustee to have reached the **same** verdict — the detector must fire on a mismatch **and stay silent at parity**. A detected drift must leave an **open** `ReconciliationException`, which is what blocks further issuance | CO-4, CO-10 |
| C-06 | **Unsigned feed rejected** | POST liability snapshot without/with bad signature while `liability.signature.required=on` | HTTP 400, snapshot rejected | CO-11 |
| C-07 | **Artifact tamper detection** | Alter one byte of a signed reserve snapshot, re-verify against JWKS | Verification FAILS | CO-3, CO-11 |
| C-08 | **Multi-bank reconciliation** | Reserve split across ≥2 banks | `bank-reconcile` aggregates every account **denominated in the program reference currency**; `reconciled=true` at parity, per-bank breakdown. Accounts in another currency are reported out-of-scope and never added to the total; an account whose bank answers in an unexpected currency counts as unverified | CO-1, CO-8 |
| C-09 | **Ledger balance invariant** | After every posting in the run | Trial balance nets to zero; `ledger_in_balance=true` | CO-8 |
| C-10 | **Redeem/burn reduces supply + liability** | PayChain burns; customer redeems | On-chain supply ↓ and trustee liability ↓ by the same amount; still fully reserved | CO-2, CO-4 |
| C-11 | **Full-reserve at all times** | Sample reserve position after each value event | `eligible_reserve ≥ liability` holds at every sample | CO-2 |
| C-12 | **Audit completeness** | Diff audit log vs actions taken in the run | Every state change has a corresponding immutable audit entry with actor + reason | CO-7 |

---

## 5. Evidence & proof capture

For **every** stage/test the harness captures a structured evidence record:

```json
{
  "testId": "E2E-01.S6",
  "controlObjective": ["CO-3"],
  "timestamp": "2026-07-20T…Z",
  "platform": "trustee",
  "request": { "method": "POST", "path": "/api/v1/paychain/proof-of-reserve/{prog}/snapshots" },
  "responseSummary": { "reserveRatioBps": 10000, "reconciliationStatus": "OK" },
  "artifact": { "type": "RESERVE_SNAPSHOT", "canonical": "<exact signed bytes>",
                "signature": { "keyId": "reserve_snapshot-v1", "alg": "ed25519", "value": "<b64>" } },
  "independentCheck": { "method": "verify-vs-jwks", "keyId": "reserve_snapshot-v1", "result": "PASS" },
  "verdict": "PASS",
  "evidenceHash": "sha256:…"
}
```

Integrity of the evidence itself:
- Each record is content-hashed; the full run produces a **Merkle-style manifest** (list of record hashes + a root hash).
- Signed artifacts are stored **verbatim** (the exact canonical bytes) so a regulator can re-verify offline against the JWKS.
- The JWKS snapshot used for verification is captured with the run.

---

## 6. Regulator evidence pack (deliverable of a run)

A single dated bundle, `evidence/e2e-<runId>/`, containing:

1. **Run report** (HTML + JSON): every test, verdict, and control-objective coverage matrix.
2. **Signed artifacts** (verbatim): reserve snapshots, mint authorizations, attestation(s), PayChain liability feed(s) — each with its signature and the verification result.
3. **JWKS** used, plus a standalone **offline re-verification script** (regulator can prove signatures independently).
4. **Ledger trial balance** and proof `ledger_in_balance=true`.
5. **Reconciliation reports**: on-chain-vs-ledger (per asset) and multi-bank ledger-vs-bank.
6. **Audit log export** for the run window (immutable, actor + reason per action).
7. **KYC/merchant status** evidence for merchants involved.
8. **SoD evidence**: maker/checker identities on each authorization; the C-02 rejection.
9. **Evidence manifest** with per-file hashes + root hash (tamper-evidence).

---

## 7. Automation design

**Harness:** a standalone TypeScript orchestrator (proposed `apps/e2e-audit/` or
`packages/e2e-audit/`) — **trustee-owned**, so the auditor's checks are independent
of the systems under test. It reuses trustee libraries: `@trustee/cryptography`
(`canonicalize` + Ed25519 `verify` for artifact/JWKS checks) and
`@stellar/stellar-sdk` (read testnet Horizon supply directly).

```
apps/e2e-audit/
  src/
    clients/        trustee.ts · platforms.ts (PayChain + PayKH)   (typed API clients)
    checks/         signatures.ts (JWKS + artifact verify) · onchain.ts (Horizon supply)
    scenarios.ts    E2E-01 stages + control tests C-01…C-12
    evidence.ts     structured record + content hashing + manifest
    report.ts       HTML + JSON regulator pack
    config.ts       env-only configuration
    http.ts         client-credential HTTP
    run.ts          orchestrates scenarios → writes evidence/e2e-<runId>/
```

Design rules:
- **Deterministic & idempotent**: unique run id; unique references per run; safe to re-run.
- **Independent assertions only**: never trust a platform's own "ok" — verify signature vs JWKS, read Horizon, sum the ledger.
- **Every step records evidence** before asserting, so failures are still captured.
- **Fail-safe**: a stage failure records the evidence and continues where safe, so the pack shows exactly where the chain broke (as the current PayChain `/earn` 404 would).
- **Config**: platform base URLs + credentials via env; no secrets in the repo.

**Run** (from the repo root; the script delegates to the `@trustee/e2e-audit` workspace):
```
npm run e2e:audit            # full suite → apps/e2e-audit/evidence/e2e-<runId>/report.html
npm run e2e:audit -- --only E2E-01
npm run e2e:audit -- --controls-only
```

**CI:** nightly on the test environment; the run report is the gate. Regulator-visit
runs are tagged and archived. The suite exits non-zero on any PASS-criteria miss or
any unmet precondition (`NOT_READY`).

---

## 8. Pass / fail & sign-off

- **READY (regulator-presentable)**: E2E-01 all stages PASS **and** every control test C-01…C-12 PASS **and** all signed artifacts verify against the JWKS **and** the evidence manifest root hash is recorded.
- **NOT_READY**: any unmet precondition (§3) — reported distinctly from a failure.
- **FAIL**: any PASS criterion missed; the pack pinpoints the stage and platform.

Sign-off block (per run): Trustee Internal Audit, Trustee Compliance, and an
acknowledgement line for PayKH and PayChain engineering leads.

---

## 9. Current known gaps (as of 2026-07-27, from live inspection)

These will make an E2E run report **NOT_READY / FAIL** until closed:
1. **PayChain**: `POST /assets/{id}/earn` returns 404 — mint produces no supply (liability feed `circulatingMinor=0`). Blocks S4, S7, C-10.
2. **Trustee prep**: target asset not yet **registered** (`LiabilityRegistryEntry` empty) and no loyalty stablecoin **bound** (no Stellar code/issuer) — blocks S7 and the on-chain arm of C-05.
3. **Signing enforcement**: `PAYCHAIN_LIABILITY_PUBLIC_KEY` not set and `liability.signature.required` off — C-06 cannot pass; feed currently demo-trusted.
4. **Automation coverage**: C-01/02/03/04/10/11 remain recorded `NOT_READY` — they need a live PayKH/PayChain or a seeded mint/redeem fixture. C-05 is now automated on both arms and no longer in that set.
5. **Service-level tests**: `apps/trustee-api` has no unit tests; the drift paths (currency scoping, exception persistence, mint-guard blocking) are covered by C-05/C-08 in the harness, not by unit tests.

## 10. Out of scope
Performance/load, chaos/DR, penetration testing, and mainnet cutover — separate plans.
