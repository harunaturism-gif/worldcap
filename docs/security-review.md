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
