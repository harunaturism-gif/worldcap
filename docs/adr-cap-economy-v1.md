# ADR — CAP Economy, Human Claim and Trust Hub
ADR ID: ADR-CAP-001
Date: 2026-09-01
Status: ACCEPTED FOR DEVELOPMENT

## Context

The previous MVP direction used WLD-only economics, a 60/10/20/10 allocation, annual jackpot, paid scratch and no custom token.

The product direction has changed and must be frozen before implementation to prevent agent drift.

## Decision

### Environment
WorldCAP remains:
- World App Mini App ONLY;
- World Chain ONLY;
- WLD-native for Title purchase and prize settlement;
- no standalone consumer product;
- browser-readable proofs only as verification surfaces.

### Title-sale economics

```text
40% CAP Redemption Program
38% Monthly Prize Pool
10% Quarterly Jackpot
10% Company Treasury
 2% Platform / Operations
```

### Monthly winners

```text
#1 55%
#2 25%
#3 10%
#4  6%
#5  4%
```

### Quarterly jackpot
Annual-only jackpot direction is replaced by quarterly cadence.

### CAP
- separate ecosystem token;
- exists before production integration;
- fixed max supply;
- not pegged to WLD;
- Title entitlement determined by published campaign metric;
- entitlement committed at issuance;
- no retroactive entitlement reduction;
- CAP cannot increase monetary winning odds;
- no APY/yield lock in V1;
- no unlimited mint;
- no promise of appreciation.

### CAP redemption
Old WLD-equivalent one-year refund/renewal assumption is replaced for V1 by CAP redemption.

Current lifecycle:

```text
Title issued
→ relevant monthly draw resolves
→ CAP redemption AVAILABLE
→ holder claims immutable CAP entitlement
```

The 40% economic allocation is not a guaranteed 40% cash refund.

Final production use of the 40% WLD accounting bucket is deferred to a separate treasury/legal ADR.

### Human Claim
Paid scratch reward is removed from V1 economics.

Scratch/reveal interaction is repurposed as a free Human Claim:

```text
verified human
→ one claim per period
→ CAP from capped Human Claim Pool
```

No Title purchase required.

### CAP Lock
Voluntary lock, initially for non-yield utility/status only.

No APY, no prize multiplier and no increased draw odds.

### Social
Social remains a core retention layer for Human Claim, winners, payout proofs, collections, milestones and ecosystem identity.

### Fairness
Fairness remains a sixth primary tab and becomes the Trust Hub for draws, jackpots, manifests, randomness, five-winner recomputation, payout proofs, CAP commitments, Human Claim proofs and system trust status.

### Automation
Routine operations should be automated.

Admins must not manually:
- choose winners;
- mutate closed eligibility;
- replace randomness;
- reassign existing CAP entitlements;
- issue one purchase twice;
- issue one Human Claim twice.

Human intervention remains for strategy, campaign parameters, security emergencies, compliance, World review, liquidity and treasury policy.

## Consequences

Positive:
- clear WLD/CAP role separation;
- free acquisition loop;
- budgeted CAP emissions;
- simpler five-winner monthly draw;
- more frequent quarterly major events;
- Fairness becomes commercial trust infrastructure;
- high automation potential.

Risks:
- chance-based monetary draws remain a World review risk;
- CAP sell pressure may be high;
- CAP liquidity becomes operationally important;
- token/legal classification still requires review;
- 40% CAP redemption must not be marketed as cash-value protection;
- low-price Title economics may be sensitive to infrastructure cost;
- Human Claim needs hard epoch budgets.

## World review posture

Submit the chance-based model transparently.

Do not hide or relabel RNG.

If World rejects specifically because winners are determined by chance, a genuine skill-based winner mechanism becomes a separate design phase.

No fake-skill wrapper is approved.

## Development authorization

This ADR authorizes closed-beta implementation of:
- CAP domain;
- campaign CAP metric;
- immutable entitlement commitments;
- Human Claim;
- CAP lock state;
- five-winner monthly draw;
- quarterly jackpot lifecycle;
- Fairness Trust Hub;
- Founder Control Center;
- stress tests.

It does NOT authorize:
- mainnet real-money launch;
- unaudited custody/payout;
- regulatory bypass;
- APY/yield staking;
- production CAP liquidity operations.

## Source-of-truth relationship

`WORLDCAP_PRODUCT_SPEC_v0.1.md` remains repository source of truth until a later spec version is merged.

Once this ADR and the linked economics documents are merged, conflicting economics in v0.1 should be treated as superseded and migrated explicitly.

Linked:
- `docs/tokenomics-cap-v0.1.md`
- `docs/product-economics-v0.2.md`
