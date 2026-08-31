# WorldCAP

WorldCAP is a World App Mini App for verified-human digital prize titles.

**LICENSE DECISION REQUIRED**: This is a public repository but currently no open-source license is granted for broad reuse.

## What WorldCAP is
WorldCAP issues persistent digital titles to humans verified by World ID. Titles are purchased with WLD on World Chain. These titles offer a scratch/reveal experience and act as entries into transparent monthly draws with independently verifiable fairness.

## Why World
By using World ID for verified-human identity, World Pay for transactions, and World Chain for infrastructure, WorldCAP is designed to provide an independently verifiable prize economy.

## Core product loop
1. **Verify**: Connect via World ID.
2. **Purchase**: Buy persistent digital titles with WLD using MiniKit/World Pay.
3. **Scratch**: Reveal instant simulated scratch outcomes.
4. **Draw**: Eligible titles automatically enter transparent, verifiable monthly draws.
5. **Collect/Renew**: Titles retain provenance and future renewal utility.

## Current implementation status
- **IMPLEMENTED — NOT DEPLOYMENT-VALIDATED**: World ID verification, WLD purchase intents, atomic Supabase title issuance, exact integer-unit accounting, and Phase 3A trust foundation.
- **NO REAL-MONEY CUSTODY**: Prize vault custody is entirely simulated.
- **NO PRODUCTION PAYOUTS**: No real-money payouts are live.
- **NOT LIVE YET**: Production randomness, custody, and independent audits remain blocked prior to real-money operation.

## Provable fairness
WorldCAP's foundation is designed to enable transparent monthly draws and independently verifiable fairness. The design intent is that administrators cannot choose or alter winners after draw closure. Every draw result is intended to be independently reproducible from public data and verifiable public randomness once production deployment and independent audit are complete.

## Architecture
WorldCAP is exclusively a **World App Mini App** operating on **World Chain**. The backend manages authenticated sessions, verifies MiniKit WLD payments against Developer Portal servers, and interacts with a secure Supabase backend (where browser access is explicitly restricted).

## Security / trust boundaries
- **Authentication:** World ID verification and World Pay confirmation are strictly server-side.
- **Data integrity:** Purchase amounts and title quantities are bound by expiring server intents, avoiding client-side manipulation. Payment references are single-use and idempotent.
- **Accounting:** Exact 18-decimal integer WLD base units are used universally. Pool values are derived from allocation rows, not actual funded reserve balances.
- **Simulated outcomes:** Scratch uses cryptographic randomness but is explicitly simulated. Winnings are recorded as non-spendable liabilities.

## Development status / non-production disclaimer
This repository is a technical MVP. **Do not run in production.** It is not an authorization to operate a lottery, gambling, sweepstakes, or real-money prize product. Applicable KYC/AML, age, geography and other controls must be implemented where required by target-market regulation, alongside independent security reviews, before real-money operation.

---

[`WORLDCAP_PRODUCT_SPEC_v0.1.md`](./WORLDCAP_PRODUCT_SPEC_v0.1.md) is the living product source of truth. Implementation and roadmap decisions should be reconciled against it while preserving verified security invariants and clearly labeling capabilities that are not live.

## Audit decision

| Decision | Source | Result |
|---|---|---|
| REUSE | Human World | IDKit 4.x Session Auth, server proof verification, signed HttpOnly session cookies, strict origin/config checks, MiniKit provider/detection, server-only Supabase pattern, rate limiting, and error boundary |
| REWRITE | worldprize-mvp + product spec | Campaign/title ownership, configurable title tiers, provenance, renewal-ready lifecycle, World Pay purchase lifecycle, exact integer-unit accounting, scratch experience, fairness presentation, wallet/history, and privacy-aware activity feed |
| IGNORE | Human World | Map, rooms, Pixi, plaza/metaverse, Human World economy/game systems, WebSockets, and admin/RBAC |

Human World was used only as read-only reference code and was not modified.

## Local development

Your explicitly local-only development mode may use a fake payment verifier. It exercises the same intent, backend confirmation, atomic issuance, ledger, and scratch paths without claiming an on-chain transfer. Development economic state is intentionally in memory and resets when the API restarts.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Runtime modes

| `WORLDPRIZE_ENV` | Persistence | Payment behavior |
|---|---|---|
| `development` | memory only when `ENABLE_DEV_MOCK_PERSISTENCE=true` | fake only when `ENABLE_DEV_FAKE_PAYMENTS=true` |
| `testnet` | Supabase required | disabled fail-closed; World Pay currently has no testnet payment rail |
| `production` | Supabase required | MiniKit WLD payment plus Developer Portal server verification |

Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `WORLD_DEVELOPER_API_KEY`, `WORLD_RP_SIGNING_KEY`, `APP_SESSION_SECRET`, or `APP_IDENTITY_SECRET` to Vite/browser variables.

## Environment setup

Copy `.env.example` to the environment-specific secret store and configure:

- World ID: `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, and exact `WORLD_ID_ACTION=worldprize-login`.
- Application session: independent high-entropy `APP_SESSION_SECRET` and `APP_IDENTITY_SECRET`, plus the exact HTTPS `APP_ORIGIN` outside local development.
- World App client: `VITE_WORLD_APP_ID`.
- Production World Pay server: matching `WORLD_APP_ID`, `WORLD_DEVELOPER_API_KEY`, and `WORLDPRIZE_PAYMENT_RECIPIENT`.
- Supabase server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ENABLE_DEV_MOCK_PERSISTENCE=false`.

World Portal must have the Mini App configured for the same app ID, allowed production URL, World ID relying party, and payment recipient. The recipient returned to the client comes only from server configuration; the server verifies reference, mined status, World Chain, WLD, exact integer-unit amount, recipient, app ID, and payer address before issuance.

## Supabase

Apply migrations in order:

1. `supabase/migrations/202608300001_worldprize_mvp.sql`
2. `supabase/migrations/202608310001_phase2_economic_vertical_slice.sql`
3. `supabase/migrations/202608310002_product_spec_reconciliation.sql`
4. `supabase/migrations/202608310003_phase3_trust_foundation.sql`

The second migration adds `numeric(78,0)` WLD base-unit columns, purchase intents, unique payment identifiers, scratch state, simulated liability classification, indexes, active campaign/game/draw seed data, and three service-role-only RPCs.

The third migration adds campaign-configurable Accessible, Purple, and Gold tiers; original-buyer/current-owner separation; immutable issuance events; independent lifecycle and renewal state; simulated renewal rules; and tier-aware atomic issuance.

The fourth migration adds the Phase 3A trust model: immutable public draw manifests, explicit draw lifecycle and randomness request binding, modeled segregated vaults, finite scratch batches, and explicit renewal funding metadata. It does not deploy custody, a production randomness provider, or payouts. See [`docs/phase3-trust-foundation.md`](./docs/phase3-trust-foundation.md).

- `worldprize_complete_purchase` locks the intent and campaign and atomically creates purchase, titles, ownership, draw entries, wallet metadata, allocation rows, ledger, and activity.
- `worldprize_reveal_scratch` locks ownership, persists one immutable result, keeps draw eligibility, and records any simulated prize as non-spendable.
- `worldprize_get_snapshot` returns private purchases/titles/ledger only for the authenticated internal user while exposing aggregate allocation/activity data.

The browser never accesses Supabase directly. RLS remains enabled and the RPCs are executable only by `service_role`.

See `docs/security-review.md` for the remaining production gates.
