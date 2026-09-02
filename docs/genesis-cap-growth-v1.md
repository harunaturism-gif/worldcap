# Genesis CAP Growth + Monthly Human Claim V2

Status: implemented for closed technical beta on `feat/genesis-cap-growth-v1`.

## Active model

Monthly Human Claim is free, Title-independent, and deterministic:

```text
verified World ID human
→ register once in one YYYY-MM UTC period
→ receive no CAP at registration
→ fixed published pool closes
→ pool / unique participants (integer floor)
→ exact share settled; remainder stays unissued
```

Epoch lifecycle is `DRAFT → PUBLISHED → OPEN → CLOSED → FINALIZED`. Participation is `NOT_CLAIMED → REGISTERED → SETTLED`. A finalized epoch and every CAP distribution row are immutable.

Genesis Growth is budget-first. Campaign configuration contains version, dates, status, fixed budget, commitment, distributed, reserved, and remaining units. The repository/migration seeds no CAP amount. Each quest receives its reward, capacity, milestone, and evidence policy from published configuration.

Internal quest evidence supports persisted first social post, verified profile, verified distinct-human referral, verified completed Title count, and a verified cosmetic-purchase record. Instagram/X quests require an authoritative provider; without one they fail closed as unavailable. Client self-attestation is never accepted.

## CAP source accounting

Every immutable distribution uses one explicit source:

- `TITLE_ENTITLEMENT`
- `HUMAN_CLAIM`
- `GENESIS_GROWTH`
- `OTHER_FUTURE`

Wallet derives source totals, available, locked, spent, burned, and total claimed. All current balances are `simulated`; no on-chain CAP transfer or production monetary authorization is implied.

## Trust and operations

- The public fairness endpoint exposes aggregate pool/source/campaign data only.
- The Founder Control Center is protected by the server-side `FOUNDER_USER_IDS` allowlist and is read-only. It aggregates product, CAP-source, Human Claim share forecasts, quest consumption, draw-trust, reconciliation, and worker-health signals without exposing control operations.
- Paid scratch is removed from the active V1 loop. Historical rows remain readable; the active route rejects new scratch liabilities.
- Monthly five-winner draws and quarterly eligibility remain independent of Human Claim and Growth rewards.

## Configuration ownership

Founder/operator configuration before activation:

- monthly pool amount and metric association;
- Genesis campaign budget, dates, version, and configuration commitment;
- quest rewards, capacities, milestone thresholds, and cosmetic rebate policy;
- authoritative external quest provider, if any;
- founder allowlist.

External/security/legal ownership before production:

- CAP supply/allocation/token contract integration;
- on-chain custody or transfer;
- CAP/WLD liquidity or price policy;
- real prize settlement;
- World review, legal/compliance approval, and independent security review.

No maximum supply, allocation percentage, reward amount, CAP/WLD rate, peg, yield, cashback promise, liquidity design, or founder token authority is defined by this implementation.
