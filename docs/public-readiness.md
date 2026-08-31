# Public Readiness Status

**Date:** 2026-09-01

## Project Status
WorldCAP is currently in a technical MVP (beta) state, preparing for public World ecosystem review. It is an exploration of a World-native digital title protocol for verified humans, featuring WLD payments, persistent ownership, and independently verifiable prize draws.

**Do not run in production.** It is not an authorization to operate a lottery, gambling, sweepstakes, or real-money prize product.

## Architecture Statement
WorldCAP is exclusively a **World App Mini App** operating on **World Chain**. Production distribution is through World App only. No standalone consumer payment rail is planned, and a standard browser must never synthesize a transaction. Public verification artifacts may remain browser-readable.

## What is Implemented
- World ID Session Auth integration.
- Expiring WLD purchase intents.
- Integration with MiniKit for payments and World Developer API verification.
- Supabase schema with exact integer-unit WLD accounting, strict row-level security (RLS), and service-role atomic RPCs.
- Campaign-configurable title tiers (Accessible, Purple, Gold).
- Phase 3A trust foundation: immutable public draw manifests, deterministic winner selection, explicit draw closure states, and finite scratch batches.
- Basic simulated scratch experience and social activity feed.

## What is Simulated
- **Prize Custody:** Prize vaults and liabilities are purely simulated accounting records and do not hold real on-chain WLD funds.
- **Scratch Winnings:** Winnings from scratch events are recorded as non-spendable simulated liabilities.
- **Randomness:** Development environments use a simulated cryptographic randomness source.
- **Renewals:** Renewal credits and rollovers are simulated logic without real WLD transfer.

## What Remains Blocked
Before any real-money prize production or mainnet launch, the following are strictly required:
1. Legal classification, market authorization, KYC/AML controls, and age/geography constraints.
2. Independent security reviews of application logic, database RPCs, and deployment infrastructure.
3. Audited on-chain Prize Vault custody with strict solvency controls and automated payouts.
4. Integration with a production verifiable randomness provider on World Chain.
5. Independent publication of manifests, verifiable drawing logic, and dispute procedures.
6. Treasury authorization policies, operational key management (e.g., multisig), and robust incident response playbooks.

## Security Assumptions
- Browser access is strictly restricted. All database mutations (purchases, scratch reveals) occur via server-authorized, service-role-only RPCs.
- World ID identity proofs and World Pay payments are always verified server-side before execution.
- Payment references are single-use, preventing double issuance of titles.
- All application layers rely on precise 18-decimal base unit (`bigint` or `numeric(78,0)`) arithmetic. No floating-point math is used for value calculations.

## Review Readiness & PR / Branch Noise

| PR # | Title | Recommendation | Explanation |
|------|-------|----------------|-------------|
| 12 | 🧹 [Code Health] Add development error logging to silenced catch blocks in authService | KEEP / REVIEW LATER | Good hygiene, aligns with logging policies, but not critical for readiness. |
| 11 | ⚡ perf: optimize snapshot allocation reduction | SUPERSEDED / CLOSE | Micro-optimization; prioritize security and stability over performance for now. |
| 10 | 🧹 Refactor long inline catch block in server/economyRoutes.ts | KEEP / REVIEW LATER | Code hygiene, low priority. |
| 9 | 🧪 Add tests for allocateWld in tokenUnits.ts | KEEP | Critical for validating WLD integer accounting logic. |
| 8 | 🧹 [code health] fix silenced error in logout | KEEP / REVIEW LATER | Hygiene improvement. |
| 7 | 🧹 [refactor] improve readability of complex condition in economyRoutes | SUPERSEDED / CLOSE | Refactor noise. |
| 6 | 🧹 refactor: Extract NavItem component in AppShell | SUPERSEDED / CLOSE | UI refactor noise. |
| 5 | Phase 3A Adversarial Audit Report and Tests | **DO NOT MERGE** | Marked DO NOT MERGE due to failing Git ancestor checks (`git merge-base`); invalid topology. |
| 4 | ⚡ Optimize cookie parsing by avoiding array allocations | SUPERSEDED / CLOSE | Micro-optimization noise. |
| 3 | ⚡ Optimize WalletPage ledger aggregation into a single reduce pass | SUPERSEDED / CLOSE | Micro-optimization noise. |
| 2 | ⚡ Optimize ledger aggregation by combining filter and reduce | SUPERSEDED / CLOSE | Micro-optimization noise. |
| 1 | chore(audit): add baseline audit docs, CI, and Phase 2 adversarial tests | KEEP | Contains critical CI and test workflows needed for the build. |
