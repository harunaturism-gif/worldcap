# Phase 3A — Trust foundation

Status: implemented as a deterministic, test-only/application foundation. No real custody, payout, or production randomness is enabled.

## Audit summary

Historical note: Phase 2 originally provided 60/10/20/10 accounting and paid scratch persistence. New purchases use the later 40/38/10/10/2 model, quarterly direction, five-winner monthly resolution, and free Monthly Human Claim V2. Original rows remain readable but are not active economics.

The legacy draw schema only pre-created `draw_entries` while a draw was `scheduled`. It had no closure transaction, frozen manifest commitment, unbiased selection algorithm, randomness request binding, or independent verification engine. Prize vault rows were accounting placeholders rather than enforceable funded/liability views. Renewal rules existed, but their future funding source was deliberately unspecified.

## REUSE

- Integer WLD base-unit helpers and exact allocation logic.
- Campaign, title-tier, ownership/provenance, lifecycle, renewal, purchase, and scratch records.
- Server-authoritative economy service/repository boundary and fail-closed runtime configuration.
- Persisted scratch result behavior and its separate low-latency randomness interface.
- Existing Supabase service-role/RLS posture.

## EXTEND

- Draw records with explicit lifecycle, tier/eligibility scope, manifest commitment, randomness request binding, winner index, and payout status.
- Supabase schema with immutable manifests, mutation guards, randomness requests, funded/committed vault units, scratch batches, and renewal-liability funding metadata.
- Security review with Phase 3A threats, controls, and deferred production gates.
- Read-only API surface with a privacy-safe fairness response.

## NEW

- Machine-testable protocol invariant helpers.
- Canonically ordered public draw manifests and a domain-separated SHA-256 Merkle commitment.
- Pure, deterministic winner selection using rejection sampling (not naive modulo).
- Deterministic unique multi-winner derivation without materializing the full eligible set.
- Draw service/repository state machine that freezes entries at `CLOSED`.
- Development/test-only deterministic draw randomness provider plus a fail-closed future provider boundary.
- Independent Verify Draw engine.
- Segregated Prize Vault, renewal-liability, and finite scratch-batch domain models.

## DEFER

- Selection of a World Chain-compatible verifiable randomness provider, pending current provider/documentation review.
- On-chain custody, Allocation Router contracts, automated settlement, and prize payouts.
- Final tier participation, scratch odds/prizes, renewal credit values, and renewal funding source.
- Public Draw Explorer polish and public manifest storage/CDN strategy.
- World Pay remains the sole production purchase rail through World App. No alternate consumer rail is planned.

## Protocol decisions

- `CLOSED` is the freeze boundary. A closed draw cannot add entries or replace its commitment.
- Public manifests contain title ID, serial, tier, campaign, draw ID, and deterministic index; they exclude user IDs and wallet data.
- Eligibility is campaign-bound and explicit: `GLOBAL` accepts only published allowed tiers; tier scopes accept exactly that tier. Lifecycle alone does not erase a previously valid entry—an archived title remains eligible when the published rule, issue time, and `drawEligible` flag allow it.
- Winner algorithm `worldcap-draw-v1` maps a 256-bit public seed to the frozen ordered manifest using rejection sampling. Administrators provide neither a title nor an index.
- Local deterministic randomness requires an explicit development/test runtime and seed. Production construction throws.
- Monthly/annual Prize Vault liabilities cannot exceed their own funding. Platform and Growth vaults never count as prize funding.
- Renewal liability is non-spendable, separately recorded, and has `UNDECIDED` funding until a founder-approved rule names a funded reserve. TODO: evaluate Growth versus a dedicated Renewal Reserve without silently changing the current published allocation.

## Distribution boundary

Authenticated ownership, purchase, scratch, collection, and wallet interactions are World App-only. Public manifests and Verify Draw may be fetched in a browser solely so third parties can reproduce fairness results.
