# WorldCAP — Product Economics Specification
Version: 0.2
Date: 2026-09-01
Status: APPROVED FOR DEVELOPMENT / NOT AUTHORIZED FOR REAL-MONEY PRODUCTION

## Product model

WorldCAP is a World App-only digital Title economy for verified humans.

Current V1 loop:

```text
World ID
→ choose Title
→ purchase in WLD
→ persistent Title ownership
→ CAP entitlement committed at issuance
→ monthly draw
→ five ordered winners
→ quarterly jackpot
→ CAP redemption becomes available under lifecycle rules
→ Title remains in collection/history
→ Social + Fairness + Wallet
```

Human Claim is the free recurring engagement loop and is independent of Title purchase.

The former paid scratch reward is superseded for this V1 direction by Human Claim.

## Gross Title-sale allocation

| Allocation | Percent |
| --- | ---: |
| CAP Redemption Program | 40% |
| Monthly Prize Pool | 38% |
| Quarterly Jackpot | 10% |
| Company Treasury | 10% |
| Platform / Operations | 2% |
| **Total** | **100%** |

Changes require a new version/ADR and cannot retroactively alter issued Titles.

## Meaning of each allocation

### 40% — CAP Redemption Program
Not a guaranteed 40% WLD refund.

The CAP units attached to each Title are determined by a published campaign metric and become immutable at issuance.

The 40% WLD accounting bucket remains segregated from Company Treasury pending a separate real-money treasury/legal decision.

### 38% — Monthly Prize Pool
Economically committed to the monthly draw and not repurposable by an administrator after allocation.

### 10% — Quarterly Jackpot
Accumulates for four major jackpot periods per year.

### 10% — Company Treasury
Company gross allocation for direction, marketing, product development, team, legal/compliance, audit, commercial activity, reserves and potential profit after obligations.

### 2% — Platform / Operations
Hosting, database, RPC/provider fees, payment infrastructure, monitoring, gas/transaction support and other direct operating costs.

## Worked examples

### 100 Titles at 1 WLD

```text
40 WLD → CAP Redemption Program
38 WLD → Monthly Prize Pool
10 WLD → Quarterly Jackpot
10 WLD → Company Treasury
 2 WLD → Platform / Operations
```

### 100 Titles at 0.30 WLD

```text
12.0 WLD → CAP Redemption Program
11.4 WLD → Monthly Prize Pool
 3.0 WLD → Quarterly Jackpot
 3.0 WLD → Company Treasury
 0.6 WLD → Platform / Operations
```

Production accounting uses integer/base units only.

## Monthly draw

Five ordered winners.

| Position | Share |
| --- | ---: |
| #1 | 55% |
| #2 | 25% |
| #3 | 10% |
| #4 | 6% |
| #5 | 4% |
| **Total** | **100%** |

Example with 38 WLD pool:

```text
#1 20.90 WLD
#2  9.50 WLD
#3  3.80 WLD
#4  2.28 WLD
#5  1.52 WLD
```

Requirements:
- titles, not humans, are draw entries;
- users may own multiple Titles;
- selection uses public/verifiable randomness;
- five winners are deterministic outputs;
- selection is without replacement unless explicitly configured otherwise;
- no admin winner-selection function;
- Verify Draw recomputes all five winners.

## Quarterly Jackpot

10% accrues to a quarterly jackpot.

Each jackpot requires:
- explicit scope;
- cutoff;
- frozen manifest;
- public commitment;
- independent/verifiable randomness;
- deterministic winner computation;
- payout target when authorized;
- Fairness proof.

Monthly draw state, quarterly jackpot state and CAP redemption state remain separate.

## CAP redemption lifecycle

Current V1 direction:

```text
Title issued
→ CAP entitlement fixed
→ relevant monthly draw resolves
→ CAP redemption AVAILABLE
→ holder claims CAP
```

The Title remains in collection/history.

CAP redemption must not automatically remove quarterly jackpot eligibility. Jackpot eligibility is an independent campaign rule/state.

Core states:

```text
LOCKED
AVAILABLE
CLAIMED
EXPIRED (only if explicitly published)
```

Double claim is forbidden.

## Human Claim

Free recurring acquisition/retention mechanism.

Not funded from the 100% WLD Title-sale allocation.

```text
verified human
→ one registration per UTC calendar month
→ fixed published pool divided equally at finalization
→ CAP
```

CAP comes from a dedicated capped Human Claim Pool.

## Social

Core retention/discovery layer.

Privacy-safe events may include:
- verified human joined;
- Human Claim milestone;
- Title acquired;
- monthly winner;
- quarterly jackpot winner;
- public payout proof;
- collection/status milestone;
- CAP utility/burn milestone;
- jackpot/system milestone.

Do not expose exact wallet balances or sensitive financial identity by default.

## Fairness as sixth primary tab

Primary navigation direction:

1. Home
2. Titles
3. Play / Human Claim
4. Social
5. Wallet
6. Fairness

Fairness is a Trust Hub.

It should show:

### Draw proofs
- closed draw
- eligible count
- manifest commitment
- randomness provider/request
- algorithm version
- five recomputed winners
- payout transaction hashes

### Jackpot proofs
- quarterly pool
- eligibility scope
- winner
- payout proof

### CAP proofs
- campaign CAP metric
- Title entitlement commitment
- Human Claim epoch/budget
- CAP claim status
- lock/burn metrics where safe

Never claim real funding/on-chain settlement when still simulated.

## Automation target

Routine operations should be ~90–95% automated.

```text
purchase verified
→ Title issued
→ ownership persisted
→ economic allocation recorded
→ CAP entitlement committed
→ draw eligibility registered
→ draw cutoff
→ atomic close
→ manifest publication
→ randomness request
→ five winners
→ payout execution when authorized
→ Fairness update
```

Human/operator responsibility remains for:
- next campaign parameters;
- CAP emission budgets;
- liquidity policy;
- security emergency actions;
- compliance;
- World review;
- jurisdiction enablement;
- treasury/legal decisions.

## Founder Control Center

Private dashboard should cover:

Product:
- active humans
- Titles sold
- WLD volume
- repeat buyer rate
- Titles/user

Draws:
- next cutoff
- eligible Titles
- manifest/randomness status
- five winner/payout states
- quarterly jackpot state

CAP:
- campaign metric
- Title entitlement budget used
- Human Claim budget used
- CAP claimed
- CAP locked
- CAP burned
- vesting/circulation where available

Treasury:
- CAP Redemption Program accounting
- Monthly Prize Pool
- Quarterly Jackpot
- Company Treasury
- Operations
- liabilities
- stuck settlements

Alerts:
- provider unavailable
- reconciliation stuck
- payout reverted
- ledger mismatch
- unusual purchase activity
- liquidity/slippage threshold breached
- contract paused
- readiness failure

## Stress-test requirements

Before real-money production, simulate at minimum:
- 100 Titles at 1 WLD;
- 100 Titles at 0.30 WLD;
- 100k Titles;
- 1m Titles;
- concurrent purchases;
- draw close under issuance race;
- five-winner no-replacement selection;
- payout retries;
- CAP entitlement immutability;
- Human Claim replay;
- Human Claim viral scale;
- 100% CAP redemption + immediate sell assumption;
- CAP -90%;
- CAP +10x;
- CAP/WLD liquidity shock;
- whale Title purchase;
- team/treasury unlock;
- operations-cost overrun;
- no utility demand;
- high burn/utility adoption.

## World review strategy

WorldCAP must not disguise RNG.

First submission:
- disclose chance-based monthly/quarterly winner selection truthfully;
- keep fairness/verifiability explicit;
- avoid unnecessary chance mechanics;
- Human Claim should not use hidden RNG in the first candidate;
- CAP lock should not promise yield;
- CAP should not increase winning odds.

If World rejects specifically because monetary winners are RNG-determined, winner selection returns to product design for a genuine skill-based mechanism.

No fake-skill wrapper is approved.

## Beta vs production

### Closed technical beta
May simulate WLD payout, CAP movement, treasury settlement and real liquidity, but must prove persistence, accounting, CAP commitments, Human Claim limits, five-winner calculation, quarterly lifecycle, Fairness recomputation, idempotency and fail-closed behavior.

### Real-money production
Requires:
- World approval;
- legal/compliance approval;
- CAP deployment/tokenomics finalization;
- liquidity plan;
- security audit;
- payout/custody architecture approval;
- production infrastructure.

## Superseded assumptions

When merged, this document supersedes conflicting v0.1 assumptions:
- 60% monthly / 10% annual / 20% platform / 10% growth;
- annual-only jackpot;
- paid scratch as primary instant reward;
- permanent no-custom-token constraint;
- five-tab navigation without Fairness.
