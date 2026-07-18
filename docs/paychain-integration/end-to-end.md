# End-to-End Walkthrough (pilot)

Assumes the API is running locally (`npm run api:dev`) with a seeded database
(`npm run db:seed`). The seed creates program `DEMO-PUSD`, reserve account
`demo-reserve-account`, and maker/checker users. Replace IDs with values returned
by earlier calls. Client-separation headers are required on client namespaces.

> Amounts are integer **minor units** (e.g. `10000` = 100.00). `PROGRAM_ID` is the
> `id` of `DEMO-PUSD` (`GET /api/v1/trustee/programs`).

## PayChain acceptance path (spec §31)

> Auth: send `-H "X-Client-Id: <id>" -H "X-Client-Secret: <secret>"` per client
> (see INTEGRATION-GUIDE.md). PayChain uses `client_paychain_demo`; deposit/bank
> calls use `client_trustee_bank`.

```bash
H_PC='-H content-type:application/json -H X-Client-Id:client_paychain_demo -H X-Client-Secret:REDACTED'
H_BANK='-H content-type:application/json -H X-Client-Id:client_trustee_bank -H X-Client-Secret:REDACTED'

# 1. PayChain requests a funding instruction
curl $H_PC -X POST localhost:3000/api/v1/paychain/funding-instructions -d '{
  "programId":"'$PROGRAM_ID'","paychainRequestId":"pcr_1","assetId":"PUSD",
  "depositor":"Acme Treasury","beneficiaryAccountId":"demo-reserve-account",
  "amountMinor":"100000","currency":"USD","permittedMethod":"BANK_TRANSFER",
  "actor":"svc:paychain"}'

# 3-4. Bank detects the deposit (trustee-bank namespace)
curl $H_BANK -X POST localhost:3000/api/v1/bank/deposits -d '{
  "programId":"'$PROGRAM_ID'","trusteeAccountId":"demo-reserve-account",
  "bankTransactionId":"BANKTX-1","amountMinor":"100000","currency":"USD",
  "transactionDate":"2026-07-18T00:00:00.000Z","actor":"ops.maker@trustee.demo"}'

# 5. Match + 6. Clear
curl $H_BANK -X POST localhost:3000/api/v1/bank/deposits/$DEP_ID/match \
  -d '{"fundingInstructionId":"'$FI_ID'","actor":"ops.maker@trustee.demo"}'
curl $H_BANK -X POST localhost:3000/api/v1/bank/deposits/$DEP_ID/clear \
  -d '{"actor":"ops.checker@trustee.demo"}'

# PayChain submits a signed liability snapshot (§15) — circulating starts at 0
curl $H_PC -X POST localhost:3000/api/v1/paychain/liability-snapshots -d '{
  "programId":"'$PROGRAM_ID'","assetId":"PUSD","assetCode":"PUSD",
  "blockchainNetwork":"demo","issuerAccount":"issuer","circulatingMinor":"0",
  "treasuryHeldMinor":"0","lockedMinor":"0","pendingMintMinor":"0",
  "pendingBurnMinor":"0","pendingRedemptionMinor":"0","confirmedBurnMinor":"0",
  "effectiveLiabilityMinor":"0","currency":"USD","ledgerReference":"blk_1",
  "sourceVersion":"1","sequence":"1","snapshotTimestamp":"2026-07-18T00:00:00.000Z"}'

# 6. Mint capacity increased
curl $H_PC localhost:3000/api/v1/paychain/reserves/$PROGRAM_ID/current

# 7-9. Maker requests, checker approves -> signed single-use authorization
curl $H_PC -X POST localhost:3000/api/v1/paychain/mint-authorizations -d '{
  "programId":"'$PROGRAM_ID'","paychainRequestId":"mreq_1","amountMinor":"100000",
  "fundingDepositIds":["'$DEP_ID'"],"makerId":"'$MAKER_ID'"}'
curl $H_PC -X POST localhost:3000/api/v1/paychain/mint-authorizations/$AUTH_ID/approve \
  -d '{"checkerId":"'$CHECKER_ID'","reason":"reserve verified"}'   # returns signature

# 11-13. PayChain mints, then confirms
curl $H_PC -X POST localhost:3000/api/v1/paychain/mint-authorizations/$AUTH_ID/confirm -d '{
  "paychainTransactionId":"tx_1","blockchainTxHash":"0xabc","amountMinor":"100000",
  "destination":"issuer","confirmedAt":"2026-07-18T00:05:00.000Z",
  "paychainSignature":"...","actor":"svc:paychain"}'

# 15. Signed reserve snapshot / proof-of-reserve
curl $H_PC -X POST localhost:3000/api/v1/paychain/proof-of-reserve/$PROGRAM_ID/snapshots
```

If the maker and checker are the **same** user, approval is rejected (§9). If the
deposit is not cleared, the mint guard blocks with `DEPOSIT_NOT_CLEARED` (§49).

## PayKH acceptance path (spec §30)

```bash
H_KH='-H content-type:application/json -H X-Client-Id:client_paykh_demo -H X-Client-Secret:REDACTED'

# 1-3. Tenant profile -> trustee verifies + activates
curl $H_KH -X POST localhost:3000/api/v1/paykh/tenants/tenant_123/payment-profiles -d '{
  "recipientName":"Merchant A","recipientAccountMasked":"***4321","bankName":"Demo Bank",
  "currency":"USD","khqrPayload":"00020101...","actor":"svc:paykh"}'
curl $H_KH -X POST localhost:3000/api/v1/paykh/payment-profiles/$PROFILE_ID/verify -d '{"actor":"ops"}'
curl $H_KH -X POST localhost:3000/api/v1/paykh/payment-profiles/$PROFILE_ID/activate -d '{"actor":"ops"}'

# 4. Payment order with unique KHQR reference
curl $H_KH -X POST localhost:3000/api/v1/paykh/payment-orders -d '{
  "tenantId":"tenant_123","profileId":"'$PROFILE_ID'","amountMinor":"2000",
  "currency":"USD","actor":"svc:paykh"}'   # returns paymentReference

# 5-7. Confirm the bank transaction against the order (duplicate-safe)
curl $H_KH -X POST localhost:3000/api/v1/paykh/payment-orders/$ORDER_ID/check-payment -d '{
  "bankTransactionId":"BANKTX-KH-1","amountMinor":"2000","currency":"USD",
  "paymentReference":"'$REF'","recipientAccountMasked":"***4321",
  "reserveAccountId":"demo-reserve-account","actor":"svc:paykh"}'
# -> signed paykh.payment.confirmed event queued to PayKH webhook
```

Re-posting the **same** `bankTransactionId` against a different order returns
`409 duplicate` and emits `paykh.payment.duplicate` (update §14/§20).
