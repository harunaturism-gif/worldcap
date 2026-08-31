# Phase 3A Adversarial Audit Report

**Role:** Independent Adversarial Security and Fairness Reviewer
**Exact Commit Reviewed:** `aa6c1d5e4cf61f7b68658fdad7bdc434f5e069a1`
**Tests Before:** 53 passing
**Tests After:** 65 passing (added 12 adversarial regression tests)

## In-Memory Repository vs. Database Bounds

The Phase 3A implementation strictly separates the `DrawService` application rules from the `DrawRepository` storage boundary. This review covers both the in-memory `DevelopmentMemoryDrawRepository` and the PostgreSQL schema (`supabase/migrations/202608310003_phase3_trust_foundation.sql`).

**Findings:**
1. **Application Layer:** The application layer accurately implements all protocol invariants for draw closures, manifest commitments, winner selection mathematics, and random selections.
2. **Database Layer:** The database schema correctly enforces state transition limits and freezes data updates for a closed draw using the `draw_entries_freeze_guard` trigger on `draw_entries`, ensuring it evaluates against `draws.status`. `draw_manifest_immutable_guard` enforces absolute manifest immutability on `draw_manifests`.

## Attack Surface Review

### 1. Fairness Mathematics & Modulo Bias

*   **Attack Attempt:** Provide a selection randomness seed in the incomplete tail above `(2^256 - (2^256 % eligibleCount))` to force modulo bias toward lower index values.
*   **Result:** VERIFIED. The algorithm correctly uses rejection sampling. Instead of naively wrapping the result via modulo, it hashes the seed against a rejection count suffix and re-rolls until the uniform constraint is satisfied.
*   **Regression Test:** Added a property-fuzzing loop in `server/adversarial-fuzz.test.ts` testing bounds dynamically against multiple sizes of `eligibleCount`, including powers of two.

### 2. Extreme Count Bounds & Number Handling

*   **Attack Attempt:** Supply `eligibleCount = 0` or request `eligibleCount` larger than the 256-bit sample space. Provide `seed = 0` or `seed = MAX_UINT256`.
*   **Result:** VERIFIED. Handled safely. Seed `0` yields `0`, and Max UINT yields deterministic rejection handling. `eligibleCount > SAMPLE_SPACE` throws. `0` entries throw `eligible_count_invalid`. `1` entry correctly bypasses randomness and returns `0` statically.
*   **Regression Test:** Defined in `server/adversarial.test.ts`.

### 3. Merkle Tree & Domain Ambiguity

*   **Attack Attempt:** Craft a `PublicManifestEntry` string resembling an internal hash node to bypass manifest immutability or artificially manipulate the Merkle commitment.
*   **Result:** VERIFIED. Domain separation is achieved correctly. Leaves are prefixed via `JSON.stringify(['worldcap-manifest-leaf-v1', ...])`, guaranteeing they differ structurally from internal nodes constructed via `Buffer.concat([Buffer.from([1]), left, right])`.
*   **Regression Test:** Covered via `server/drawTrust.test.ts`.

### 4. Duplicate Manifest & Eligibility Handling

*   **Attack Attempt:** Inject identical title serials/IDs to artificially boost odds. Try to overwrite a manifest record.
*   **Result:** VERIFIED. The `buildDrawManifest` validates and asserts uniqueness across all titles using a `Set`. Modifying an existing manifest causes `draw_manifest_immutable` in the database, and `closed_draw_snapshot_immutable` in the in-memory repository.
*   **Regression Test:** Included in `server/adversarial.test.ts` for uniqueness. Database overwrite explicitly blocked in Postgres triggers.

### 5. Multi-Winner Generation

*   **Attack Attempt:** Use partial Fisher-Yates with `winnerCount` greater than `MAX_SAFE_INTEGER` to cause out-of-bounds loops or memory exhaustion (as the sparse mapping is used).
*   **Result:** VERIFIED. The system correctly isolates `winnerCount > BigInt(Number.MAX_SAFE_INTEGER)` and throws.
*   **Regression Test:** Enforced explicitly via `server/adversarial-fuzz.test.ts`. Loop fuzzing confirms no index duplicates across variable seeds up to 99 winners.

### 6. Draw State & Resolution Hijacking

*   **Attack Attempt:** Call `resolveDraw` without a `RANDOMNESS_PENDING` status, double-resolve a `RESOLVED` draw, or call `openDraw` on a `CLOSED` draw.
*   **Result:** VERIFIED. The repository guards strictly enforce status progressions. Forward progression (`DRAFT -> OPEN -> CLOSED -> RANDOMNESS_PENDING -> RESOLVED -> SETTLED`) is the only vector. Backward transitions fail with `draw_status_transition_invalid`.
*   **Regression Test:** State transitions documented and bounded in `server/adversarial.test.ts`.

### 7. Winner Override & Storage Tampering

*   **Attack Attempt:** Mutate `winning_title_id` or `winning_index` for a draw after it has been correctly evaluated via `selectWinningIndex`.
*   **Result:** VERIFIED. `verifyDraw` executes `selectWinningIndex` actively and compares it against the persisted record. Tampering results in an independent validation failure.
*   **Regression Test:** Verified via tampered object structures in `server/adversarial.test.ts`.

## Unresolved Risks
*   **Service-Role Authority Bypass:** The Postgres RLS policy permits `service_role` to overwrite `economic_vaults` and `scratch_batches`. If a service-role token is leaked, these tables could be modified beyond application rules. (Currently acceptable, but note for future testnet boundaries).
*   **Randomness Delivery & Outages:** There is no implemented World Chain provider. The bounds test currently assumes ideal VRF generation and callback idempotency.
*   **Custody & Settlement Payout:** `economic_vaults` models hold no funds, and `payout_status = SETTLED` executes no on-chain logic.

## Merge Recommendation
**APPROVE**

All CRITICAL, HIGH, and MEDIUM security constraints related to Phase 3A trust structures operate as intended without runtime weaknesses. Database triggers accurately map application logic into Postgres guardrails.
