# Canonical closed beta acceptance test

The automated version is `server/betaSmoke.test.ts`. Run `npm test` and then perform this persistent-environment smoke test.

1. Confirm `/health` is alive and `/ready` is ready.
2. Authenticate with a configured World ID test identity.
3. Load the active campaign and inspect Accessible, Purple, and Gold prices/scopes.
4. Acquire one Purple title through the deliberately selected rail. In demo mode, confirm the page says no WLD is charged.
5. Refresh. Confirm the serial, original buyer provenance, current ownership, lifecycle, and renewal fields persist.
6. Physically scratch the title, refresh, and confirm exactly the same immutable result returns.
7. Confirm the title remains owned and draw eligible and simulated prize liability is non-spendable.
8. Open a campaign/tier-scoped draw, wait past the cutoff, and invoke the service-role atomic close RPC twice. Confirm the retry returns the same commitment and count.
9. Try issuing/mutating an entry after closure. Confirm it cannot enter the frozen manifest.
10. Publish and fetch the privacy-safe artifact. Confirm it has no user ID, wallet, World ID, or purchase information.
11. Request randomness once, restart the coordinator, and confirm no second provider request is made.
12. Fulfill the exact request and resolve. Confirm replay, provider substitution, and wrong-request responses fail.
13. Fetch `/api/draws/:id/verify`. Confirm each required component is true and the winner is recomputed from the artifact and seed.
14. If a registry is actually deployed, compare its anchor to the published commitment. Do not mark anchor verification required without observed deployment evidence.
15. Confirm Wallet shows verified spend separately from demo acquisition volume and simulated liabilities.
16. Confirm title archive/renewal data remains unchanged and renewal liability is not spendable value.

Acceptance requires a clean full verification suite and an operator record of the draw ID, manifest hash, request ID, seed/proof reference, winner, and verification response.
