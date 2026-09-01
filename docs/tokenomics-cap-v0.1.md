# WorldCAP — $CAP Tokenomics Specification
Version: 0.1
Date: 2026-09-01
Status: APPROVED FOR DEVELOPMENT / NOT AUTHORIZED FOR REAL-MONEY PRODUCTION

## Purpose

$CAP is the ecosystem token for WorldCAP.

Core roles:
- WLD = settlement / Title purchase / prize settlement asset.
- TITLE = primary product object.
- CAP = ecosystem identity, utility, Human Claim, lock/commitment and Title redemption entitlement.
- Fairness = public proof layer.

WorldCAP remains World App Mini App ONLY, World Chain ONLY and WLD-native.

## Constitutional token rules

1. CAP must exist before production integration.
2. CAP has a fixed maximum supply. No unlimited mint path.
3. Distribution pools are capped before distribution begins.
4. Every emission mechanism has an explicit budget.
5. Title entitlements are fixed at issuance under a published campaign metric.
6. CAP is not pegged to WLD.
7. CAP entitlement must not be described as a guaranteed fiat/WLD refund.
8. CAP must not increase a user's odds of winning a monetary draw.
9. Initial CAP lock must not promise APY, yield or enhanced monetary returns.
10. Team/company/treasury allocations require transparent vesting.
11. No promise of price appreciation.
12. Existing Title entitlements cannot be reduced retroactively.

## Supply architecture

The exact MAX_SUPPLY number is intentionally NOT fixed by this document.

Before token deployment, the allocation table must define at minimum:
- Human Claim Pool
- Title Redemption / Entitlement Pool
- Ecosystem / Utility Pool
- Liquidity Pool
- Company Treasury
- Team Allocation
- Partners / Strategic Reserve

The sum of all pools must equal MAX_SUPPLY.

## Campaign emission budget

CAP distribution is budget-first.

Each campaign/epoch publishes immutable parameters before users acquire Titles or claim rewards.

Suggested schema:

```text
campaignId
capMetricVersion
titleEntitlementBudget
humanClaimEpochBudget
titleClassCoefficients
claimFormula
startsAt
endsAt
commitmentHash
```

Exact values are campaign configuration, not hardcoded constants.

## CAP Redemption Entitlement

The approved model does NOT use a spot WLD/CAP exchange rate.

```text
Title purchase
→ campaign CAP metric
→ deterministic CAP entitlement
→ entitlement committed at Title issuance
→ entitlement claimable according to lifecycle rules
```

Example only:

```text
Accessible metric: 120 CAP
Purple metric: 400 CAP
Gold metric: 900 CAP
```

Once a Title is issued, `capEntitlementUnits` is immutable.

CAP market price changing later does not alter the Title entitlement.

## 40% economic allocation

The Title purchase economy reserves 40% for the CAP redemption program.

This 40% is an economic allocation, NOT a promise that the holder later receives 40% of the WLD or fiat purchase value.

The final production treasury treatment of this 40% WLD bucket requires a separate treasury/legal ADR.

Until then, beta accounting keeps it segregated and non-spendable by Company Treasury.

## Human Claim

Human Claim replaces the paid scratch reward as the high-frequency free interaction.

```text
World ID verified human
→ one eligible Human Claim per defined period
→ CAP
```

Active closed-beta cadence: one registration per verified human per UTC calendar month. A fixed pool is published before opening; registration credits nothing immediately; finalization divides the pool equally and leaves any integer remainder explicitly unissued.

Rules:
- no Title purchase required;
- one verified human cannot claim twice in the same period;
- reward comes only from the dedicated Human Claim Pool;
- no unlimited minting;
- claim formula and epoch budget are published;
- first World review candidate should not use hidden RNG for Human Claim;
- claim history is persisted and auditable.

## CAP Lock

CAP Lock is voluntary.

```text
holder locks CAP
→ CAP becomes temporarily non-liquid
→ holder receives ecosystem/status utility
→ holder may unlock after the selected lock period
```

V1 MUST NOT provide:
- APY
- yield
- increased WLD payout
- increased draw probability
- preferential random odds

Possible utilities:
- badges/status
- profile cosmetics
- Title cosmetics
- collectible identity
- social functionality
- community privileges
- campaign theme voting
- non-yield ecosystem experiences

## Utility and sinks

CAP must have reasons to be used, not only sold.

Architecture must support:
- cosmetics
- profile customisation
- collectible upgrades
- limited visual editions
- social identity/status
- community actions
- other non-yield utilities

A configurable portion of CAP spent on utility may be burned.

Exact burn percentages are intentionally open.

## Liquidity

Production CAP requires CAP/WLD liquidity on World Chain.

Required controls:
- minimum viable liquidity threshold;
- slippage protection;
- price-impact monitoring;
- no blind market operation;
- treasury/LP concentration monitoring;
- emergency controls;
- no claim that CAP is price-stable.

CAP is not a stablecoin.

## Sell-pressure model

Stress testing must include:
- 100% immediate redemption sell;
- CAP -90%;
- CAP +10x;
- Human Claim viral adoption;
- liquidity -50%;
- whale holder / whale Title buyer;
- large team/treasury unlock;
- zero utility demand;
- high utility/burn adoption.

Tokenomics is unhealthy if core product solvency requires CAP price appreciation.

## Fairness / proof requirements

Fairness should expose or derive:
- CAP metric version;
- CAP entitlement attached to a Title;
- entitlement commitment hash;
- Human Claim epoch budget;
- CAP claimed;
- CAP locked;
- CAP burned;
- emission/circulation metrics where available;
- public vesting schedules.

Do not expose private user financial data.

## Development states

### Development
Mocks and deterministic fixtures allowed.

### Closed technical beta
Persistent CAP domain, entitlement commitments, Human Claim budget accounting and lock state may be simulated/non-spendable.

### Production
Requires:
- deployed CAP contract;
- final token allocation;
- vesting;
- liquidity plan;
- security review;
- World review;
- legal/compliance approval for target jurisdictions.

## Explicit non-goals for CAP V1

Do not implement yet:
- staking APY;
- yield farming;
- CAP-based increased draw odds;
- CAP-based prize multipliers;
- unlimited emissions;
- algorithmic peg;
- stablecoin behavior;
- speculative leverage;
- DAO treasury control;
- token presale;
- hidden future-token promises.

## Approved implementation order

1. CAP domain types and integer accounting.
2. Campaign CAP metric/version model.
3. Immutable Title CAP entitlement commitment.
4. Human Claim epoch/budget model.
5. One-human-per-period claim enforcement.
6. CAP lock/unlock state machine.
7. Utility/sink abstraction.
8. Fairness CAP proof surfaces.
9. Founder CAP monitoring dashboard.
10. Stress-test suite.
11. Real token contract/liquidity only after external gates.
