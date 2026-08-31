# WorldCAP

WorldCAP is a World App Mini App for verified-human digital prize titles.

It is exclusively a World App product, runs on World Chain, and is WLD-native. Verified humans acquire persistent numbered titles, reveal a physical scratch surface, remain eligible for published draws, and can independently reproduce draw results from privacy-safe public artifacts. Browser-readable fairness artifacts are verification surfaces only—not a separate consumer product, wallet path, or payment rail.

[`WORLDCAP_PRODUCT_SPEC_v0.1.md`](./WORLDCAP_PRODUCT_SPEC_v0.1.md) is the living product source of truth. Implementation and roadmap decisions should be reconciled against it while preserving verified security invariants and clearly labeling capabilities that are not live.

Scratch outcomes and draw settlement remain explicitly simulated. A simulated prize is stored as a non-spendable liability and never presented as real WLD.

## Audit decision

| Decision | Source | Result |
|---|---|---|
| REUSE | Human World | IDKit 4.x Session Auth, server proof verification, signed HttpOnly session cookies, strict origin/config checks, MiniKit provider/detection, server-only Supabase pattern, rate limiting, and error boundary |
| REWRITE | worldprize-mvp + product spec | Campaign/title ownership, configurable title tiers, provenance, renewal-ready lifecycle, World Pay purchase lifecycle, exact integer-unit accounting, scratch experience, fairness presentation, wallet/history, and privacy-aware activity feed |
| IGNORE | Human World | Map, rooms, Pixi, plaza/metaverse, Human World economy/game systems, WebSockets, and admin/RBAC |

Human World was used only as read-only reference code and was not modified.

## Local development

Your ignored local `.env.development` may use an explicit development-only session and fake payment verifier. It exercises the same intent, backend confirmation, atomic issuance, ledger, and scratch paths without claiming an on-chain transfer. Development economic state is intentionally in memory and resets when the API restarts.

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
| `beta` | Supabase required | real World Pay verification or deliberately enabled, clearly labeled non-monetary demo acquisition |
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
5. `supabase/migrations/202609010001_atomic_draw_closure.sql`
6. `supabase/migrations/202609010002_durable_draw_coordinator.sql`
7. `supabase/migrations/202609010003_beta_demo_purchase_mode.sql`
8. `supabase/migrations/202609010004_payment_reconciliation.sql`
9. `supabase/migrations/202609010005_randomness_fulfillment_hardening.sql`
10. `supabase/migrations/202609010006_public_artifact_v2.sql`
11. `supabase/migrations/202609010007_external_randomness_proof.sql`

The second migration adds `numeric(78,0)` WLD base-unit columns, purchase intents, unique payment identifiers, scratch state, simulated liability classification, indexes, active campaign/game/draw seed data, and three service-role-only RPCs:

The third migration adds campaign-configurable Accessible, Purple, and Gold tiers; original-buyer/current-owner separation; immutable issuance events; independent lifecycle and renewal state; simulated renewal rules; and tier-aware atomic issuance.

The fourth migration adds the Phase 3A trust model: immutable public draw manifests, explicit draw lifecycle and randomness request binding, modeled segregated vaults, finite scratch batches, and explicit renewal funding metadata. It does not deploy custody, a production randomness provider, or payouts. See [`docs/phase3-trust-foundation.md`](./docs/phase3-trust-foundation.md).

- `worldprize_complete_purchase` locks the intent and campaign and atomically creates purchase, titles, ownership, draw entries, wallet metadata, allocation rows, ledger, and activity.
- `worldprize_reveal_scratch` locks ownership, persists one immutable result, keeps draw eligibility, and records any simulated prize as non-spendable.
- `worldprize_get_snapshot` returns private purchases/titles/ledger only for the authenticated internal user while exposing aggregate allocation/activity data.

The browser never accesses Supabase directly. RLS remains enabled and the RPCs are executable only by `service_role`.

## Current trust boundary

- World ID verification and World Pay verification are server-side.
- Purchase amount and title quantity come from a server-created, expiring intent—not client totals.
- Payment references and transaction IDs are globally single-use; confirmation is idempotent under retries and concurrent requests.
- WLD uses 18-decimal integer base units (`bigint` in application code, `numeric(78,0)` in Postgres).
- Pools are derived from persisted allocation rows. They are accounting values, not proof of funded prize vaults.
- Scratch uses server cryptographic randomness, but it is explicitly simulated and not independently verifiable.
- Social activity avoids ownership lists and balance disclosure. Member-authored posts are still local-session MVP UI.

See `docs/security-review.md` for the remaining production gates.

The closed-beta architecture, exact deployment checklist, canonical smoke test, and accepted World App-only decision are documented in `docs/beta-technical-plan.md`, `docs/beta-deployment.md`, `docs/beta-smoke-test.md`, and `docs/adr-world-app-only.md`.
