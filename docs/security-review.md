# Phase 2 security review

## Enforced now

- Fail-closed World ID and application-session configuration outside explicit development mode.
- Exact browser origin checks, HttpOnly SameSite cookies, request body limits, and route rate limits.
- Server-created, expiring purchase intents and server-side World Developer API verification.
- Strict verification of payment reference, mined status, World Chain, WLD, amount, recipient, app ID, and payer address.
- Unique transaction/reference constraints plus row locks and one atomic purchase-completion transaction.
- Integer WLD base units end to end; allocation remainder is assigned deterministically so rows sum exactly to the purchase.
- Server-authoritative ownership and scratch results; another user receives no private ownership data and cannot scratch the title.
- One scratch result per title; retry returns the stored result and draw eligibility remains true.
- Simulated winnings are `spendable=false`, do not alter verified spend, and are labeled as liabilities.
- Service-role-only database RPCs and RLS with no browser policies.

## Mocked or intentionally incomplete

- Local development uses in-memory persistence and an explicit fake verifier.
- Testnet payment is disabled because the current World Pay product does not support a testnet rail.
- Scratch uses server cryptographic randomness, not VRF or commit/reveal.
- Scratch and draw prize settlement, vault custody, claims, and redemption are simulated.
- Social post persistence, follows, reactions, moderation, and public-profile consent controls are minimal.
- The migration has not been applied to a user-supplied Supabase project in this workspace.

## Required before real-money or prize production

1. Legal classification, official rules, eligibility, age/geography controls, responsible-play controls, sanctions/AML review, privacy review, and jurisdiction-specific approvals.
2. Independent security review of authentication, payment reconciliation, Postgres functions, RLS, deployment secrets, dependencies, abuse controls, and incident response.
3. Reconciliation worker for pending/late/reorged payments, durable observability, alerting, backups, and operator runbooks.
4. Audited custody/vault and payout architecture with solvency controls; accounting pool numbers must not imply funded reserves.
5. Public, auditable randomness and signed/immutable draw inputs; documented rerun and dispute procedures.
6. Idempotent claim/payout state machine, treasury authorization controls, withdrawal security, and recovery paths.
7. Load/concurrency testing against the actual Supabase project and integration testing inside a registered World App.

This repository is a technical MVP, not authorization to operate a lottery, gambling, sweepstakes, or real-money prize product.

## Phase 3A trust-foundation review

### Controls added

- Draw closure is an explicit state transition. Application and migration guards reject eligibility mutations after `CLOSED`.
- Public manifests are canonically ordered and omit owner/user/wallet identifiers. A domain-separated SHA-256 Merkle root commits to draw ID, index, title ID, serial, tier, and campaign.
- `worldcap-draw-v1` uses bounded rejection sampling over a 256-bit space, avoiding naive modulo bias. Unique multiple winners use a deterministic sparse partial Fisher–Yates selection.
- Resolution accepts only a response bound to the stored provider and request ID. The repository rejects a resolved winner unless the public verifier reproduces it from the stored seed and manifest.
- There is no service/API parameter for a winner or winning index. The design is intended so administrators cannot choose or alter winners after draw closure.
- Cross-campaign leakage, issue-after-close entries, disabled eligibility, and undeclared tier access are rejected. `GLOBAL` still requires an explicit published tier allow-list.
- Archived and scratched titles do not silently lose eligibility; eligibility follows the frozen, published rule inputs.
- Prize Vault constructors and database checks enforce committed liability not exceeding funding. Platform/Growth balances are excluded from prize funding and cannot hold prize liabilities.
- Renewal value is a separate, non-spendable modeled liability. An unfunded liability cannot claim a funding source implicitly.
- Scratch batches are finite and reject a maximum liability above funded prize units.
- Local deterministic draw randomness requires explicit development/test construction and fails closed for production/testnet. Scratch randomness remains a separate provider boundary.

### Findings and current limitations

- **No production randomness provider:** the `VerifiableDrawRandomnessProvider` boundary deliberately throws. Provider selection requires current World Chain/provider documentation, proof verification rules, replay/finality handling, outage policy, and an independent review.
- **No custody:** `economic_vaults` are modeled accounting records, not on-chain balances. They must not be displayed as proof of funded reserves.
- **No automated payout:** resolution changes payout state to pending only. Settlement before finality is not implemented, and no ordinary prize can be paid by this foundation.
- **No production draw coordinator:** mutating draw operations are library-only in Phase 3A. Public HTTP routes are read-only; production Supabase closure/randomness workers remain Phase 3B work.
- **Service-role trust remains:** direct database service-role misuse is outside the application state-machine boundary. Before testnet automation, use narrowly scoped database functions/roles, append-only audit events, multisig/operator separation, and independent reconciliation.
- **Manifest publication remains local/database modeled:** immutable external storage, durable public availability, timestamp/block anchoring, and signed publication are not yet implemented.
- **Randomness availability policy is open:** retry, provider failure, late fulfillment, and draw cancellation rules must be published before real draws. A fulfilled request must never be substituted merely because its result is inconvenient.
- **Tier economics are not finalized:** scopes are explicit and unweighted, but founder/product/legal decisions must define which tiers enter Global, annual, and exclusive draws.
- **Renewal funding is unresolved:** evaluate Growth funding versus a dedicated Renewal Reserve. Do not activate non-zero credits until a funded source and accounting treatment are approved.
- **Scratch inventory assignment is deferred:** the batch solvency model exists, but finite outcome generation/commitment, secret handling, and independent verification are not yet designed.

### Phase 3B security gates

1. Select and validate a World Chain-compatible verifiable randomness provider from current primary documentation; pin network, contract, proof, confirmations, and replay rules.
2. Implement transactional Supabase draw closure: select eligible titles under lock, write ordered entries/manifest, store commitment, and change to `closed` in one transaction.
3. Add a durable request/fulfillment worker with idempotency, request-to-draw binding, finality checks, alerts, and a no-substitution incident procedure.
4. Publish manifests and algorithm source independently, anchor the commitment, and test the public verifier against production-shaped fixtures.
5. Design audited testnet custody/Allocation Router and liability-commit APIs before representing any vault as funded.
6. Add settlement state-machine tests proving no payout before a verified resolved draw and no double settlement.
