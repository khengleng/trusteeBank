# PayKH merchant registry contract (PayKH → trustee)

**PayKH is the system of record for merchant onboarding and KYC.** The trustee
does not run merchant KYC. It keeps a lightweight **mirror** of the merchants
PayKH has onboarded, so it can enforce referential integrity: a settlement or
loyalty redemption may only target a merchant PayKH has registered and reported
as `ACTIVE` + KYC `VERIFIED`.

## PayKH registers / re-reports a merchant

```
POST /api/v1/paykh/merchants          (PayKH credentials)
{
  "tenantId": "merchant-acme-group",
  "merchantCode": "ACME-001",
  "legalName": "Acme Co., Ltd",
  "country": "KH",
  "paykhMerchantRef": "pkh_m_123",     # PayKH's own merchant id
  "kycStatus": "VERIFIED",             # PENDING | VERIFIED | REJECTED (PayKH decides)
  "status": "ACTIVE",                  # ACTIVE | SUSPENDED | CLOSED (PayKH decides)
  "riskLevel": "LOW",
  "actor": "paykh:onboarding"
}
```

Idempotent upsert keyed by `(tenantId, merchantCode)`. The trustee stores the
KYC/status exactly as PayKH reports them.

## PayKH updates status (e.g. suspend, KYC change)

```
POST /api/v1/paykh/merchants/{id}/status
{ "kycStatus": "VERIFIED", "status": "SUSPENDED", "actor": "paykh:risk" }
```

## Trustee enforcement

- `POST /api/v1/paykh/settlements` and `POST /api/v1/paykh/loyalty/{id}/redeem`
  call `requireActive(merchantId)`, which rejects unless the mirrored merchant is
  `status=ACTIVE` and `kycStatus=VERIFIED`.
- The trustee never approves KYC itself; it reflects PayKH's decision. This keeps
  the KYC authority with PayKH while giving the trustee the referential integrity
  it needs for safeguarding and settlement.
