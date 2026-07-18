# Legal-Assumption Register

The platform does **not** hard-code legal classification (spec §3). This register
lists assumptions the software makes that **require confirmation by the trustee
bank's legal counsel and the relevant regulator** before real funds are processed.
Each row is a decision point, not a legal conclusion.

| ID | Assumption | Where it surfaces | Requires confirmation |
|----|------------|-------------------|-----------------------|
| LA-01 | Reserve accounts operate as `SAFEGUARDED_CUSTOMER_FUNDS` by default | `Program.legalModel`, seed | Legal form of safeguarding (trust vs. safeguarding vs. client-money) |
| LA-02 | Default fiat-backed configuration requires ≥100% eligible reserve | `Program.requiredRatioBps=10000` | Whether another legally permitted model applies |
| LA-03 | "Proof of reserve" terminology is permitted for the program's assets | proof-of-reserve module | Approved terminology; may be "proof of safeguarding" for PayKH funds (update §23) |
| LA-04 | PayKH merchant settlement balances are **not** described as "reserve" | fund classification, registry | Approved terminology per update §23 |
| LA-05 | Non-monetary promotional points require no fiat backing | `FundClassification`, backing policy | Classification of each PayKH reward as monetary vs. promotional (update §15/§16) |
| LA-06 | Cashback / gift-card / stable-value credits are backed liabilities | backing policy (100%) | Legal treatment, breakage and expiry rules |
| LA-07 | Trustee platform is authoritative for cleared bank balances; PayChain/PayKH never alter bank records | ledger, adapters | Contractual data-ownership boundaries (update §10) |
| LA-08 | Maker-checker (two persons) satisfies segregation-of-duties for mint/settlement | approvals, guards | Whether approver matrices/limits require a third approver for high value (§9) |
| LA-09 | Signed events are contractually authoritative notifications to clients | events, webhook worker | Legal weight of signed webhooks vs. reconciliation files |
| LA-10 | Railway (with Enterprise controls) is an acceptable processor for the chosen environment | deployment | Vendor-risk & data-residency assessment (update §8/§32) |
| LA-11 | Document hashes may be anchored, but evidence itself is never on a public chain | evidence (design) | Whether hash anchoring is legally approved (§32) |
| LA-12 | Cross-program / cross-client reserve is disallowed unless explicitly configured | registry, guards | Any approved shared-reserve arrangement (§7) |

## Standing rules encoded in software

- No mint without cleared, matched, compliance-passed reserve (guard + statuses).
- A mint authorization is single-use, amount/asset/program-bound and time-limited.
- Financial journals are append-only; corrections are compensating entries.
- One bank transaction satisfies at most one PayKH payment order.
- High-risk features and real-funds/auto-approval flags default **off**.

Update this register whenever a new assumption is introduced. Nothing here should
be read as legal advice.
