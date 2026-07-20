# @trustee/e2e-audit

Trustee-owned end-to-end **audit harness** across PayKH, PayChain and the Trustee.
It drives the platforms, **independently verifies** every figure (signatures against
the JWKS, on-chain supply from Stellar Horizon, ledger balance from the trial
balance), and emits a tamper-evident **regulator evidence pack**.

See the full plan: [`docs/audit/e2e-regulator-test-plan.md`](../../docs/audit/e2e-regulator-test-plan.md).

## Run

```bash
# point at the systems under test (secrets via env only)
export TRUSTEE_API_URL=https://api.trustee.cambobia.com
export TRUSTEE_BANK_CLIENT_ID=...   TRUSTEE_BANK_CLIENT_SECRET=...
export PAYCHAIN_CLIENT_ID=...       PAYCHAIN_CLIENT_SECRET=...
export PAYCHAIN_API_URL=...         PAYKH_API_URL=...        # optional; NOT_READY if unset
export E2E_PROGRAM_ID=...           STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

npm run e2e:audit -w @trustee/e2e-audit                 # full suite
npm run e2e:audit -w @trustee/e2e-audit -- --only E2E-01
npm run e2e:audit -w @trustee/e2e-audit -- --controls-only
```

## Output

`evidence/e2e-<runId>/` — `report.html` (regulator pack), `report.json` (every
record + verbatim signed artifacts), `manifest.json` (per-record hashes + root
hash). Exit code: `0` PASS · `2` NOT_READY · `1` FAIL (CI gate).

## Design rules
- **Independent assertions only** — never trust a platform's own "ok".
- **Every step records evidence before asserting**, so failures are captured.
- **Fail-safe** — a stage failure is recorded and the run continues where safe,
  so the pack shows exactly where the chain broke.
- Reuses `@trustee/cryptography` (canonicalize + Ed25519 verify) and
  `@trustee/adapters` (Horizon supply read) — the trustee's own primitives.
