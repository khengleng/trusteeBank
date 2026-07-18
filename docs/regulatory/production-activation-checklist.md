# Production Activation Checklist

Do **not** enable real-money production (`production.real-funds.enabled`) until
every item is complete (trusteebankpromptupdate §32, base spec §41–§43).

- [ ] Trustee-bank business approval
- [ ] Legal structure approval (safeguarding/trust form confirmed — see legal-assumption-register)
- [ ] Regulatory analysis and any required authorization
- [ ] Railway vendor-risk assessment + Railway Enterprise decision (SSO/MFA/RBAC, protected prod deploys)
- [ ] Data-residency decision (Railway PostgreSQL HA vs. external bank-approved managed PostgreSQL)
- [ ] Core-banking integration approval (replace pilot/manual adapters)
- [ ] Penetration test + security architecture review
- [ ] Access-control review (RBAC, break-glass, PAM)
- [ ] Backup restore test + disaster-recovery test
- [ ] AML/compliance provider integration (replace pilot compliance adapter)
- [ ] Operating-procedure approval (maker-checker, emergency controls)
- [ ] Reconciliation sign-off (three-way: PayKH ↔ Trustee ↔ PayChain)
- [ ] Auditor evidence review
- [ ] Incident-response exercise
- [ ] Production-readiness approval

A hosting-provider certification does not by itself make the application
compliant (update §8).
