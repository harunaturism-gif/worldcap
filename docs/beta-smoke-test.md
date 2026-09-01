# Canonical closed beta acceptance test

The automated version is `server/betaSmoke.test.ts`. Run `npm test` and then perform this persistent-environment smoke test.

1. Confirm `/health` is alive and `/ready` reports required persistence/provider configuration accurately.
2. Authenticate with a configured World ID proof-of-human identity inside World App.
3. Load the active campaign and inspect Accessible, Purple, and Gold prices and eligibility scopes.
4. Acquire five Purple Titles through the deliberately selected rail. Demo mode must say no WLD is charged.
5. Refresh. Confirm serials, original buyer provenance, current ownership, CAP entitlement, lifecycle, and renewal data persist.
6. Open Play/Genesis Journey. Confirm no paid scratch CTA or instant CAP credit exists.
7. Register for the published UTC calendar month. Confirm status becomes `REGISTERED`, CAP credited remains zero, participant count changes once, and the displayed share is labeled `ESTIMATE`.
8. Create a persisted social post and evaluate the configured first-post quest. Confirm a published reward can be claimed once and its ledger source is `GENESIS_GROWTH`.
9. Verify an external-follow quest is unavailable/pending unless its authoritative provider is configured; self-attestation must not work.
10. Close and finalize Monthly Human Claim through the service-role worker/RPC. Confirm exact equal settlement, explicit unissued remainder, immutable final state, and idempotent replay.
11. Open a MONTHLY campaign/tier-scoped draw, wait past cutoff, and invoke the atomic close RPC twice. Confirm one frozen manifest commitment and exactly five eligible Titles.
12. Try issuing/mutating an entry after closure. Confirm it cannot enter the frozen manifest.
13. Publish and fetch the privacy-safe artifact. Confirm it contains no user ID, wallet, World ID, or purchase information.
14. Request randomness once, restart the coordinator, and confirm no second provider request is made.
15. Fulfill the exact request and resolve. Confirm replay, provider substitution, and wrong-request responses fail.
16. Fetch `/api/draws/:id/verify`. Confirm the five ordered 55/25/10/6/4 winners are recomputed without replacement.
17. Confirm relevant Title CAP becomes `AVAILABLE`, claims exactly once, and every Title remains quarterly eligible with collection/renewal state unchanged.
18. Confirm Wallet separates verified WLD spend, demo volume, simulated draw liability, and CAP sources (`TITLE_ENTITLEMENT`, `HUMAN_CLAIM`, `GENESIS_GROWTH`, `OTHER_FUTURE`).
19. Confirm Fairness exposes draw proof plus privacy-safe CAP/Human Claim/Genesis aggregates.
20. Use an allowlisted founder identity to open Control Center. Confirm all controls are read-only. Confirm a non-allowlisted identity receives `403`.
21. Sign out and use the browser-readable verification surface. Confirm it cannot purchase, claim, own, transfer, or manage Titles.

Acceptance requires a clean full verification suite and an operator record of the draw ID, manifest hash, request ID, seed/proof reference, all five winners, Human Claim finalization, CAP source totals, and verification response.
