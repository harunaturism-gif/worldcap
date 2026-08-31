# Standalone web compatibility

WorldCAP keeps World ID, World Pay, wallet, and public verification as separate capabilities.

- Public fairness artifacts, Draw Explorer, and Verify Draw are available without authentication in a standard browser.
- The same server RP-context and `/api/v4/verify/{rp_id}` verification boundary can support IDKit 4.x in World App or standard-browser connector/QR transport.
- The current UI retains the mature World App session flow. Completing the standalone authenticated QR/deep-link presentation is a beta integration task once the registered origin is available.
- World Pay remains the Mini App rail. A standard browser must never synthesize a transaction or silently switch to a fake rail.
- A future standalone payment rail needs its own wallet connection, chain/asset/recipient/finality validation, idempotency, reconciliation, and legal approval. It must implement the existing purchase-intent boundary rather than bypassing it.

Primary documentation: https://docs.world.org/world-id/idkit/javascript and https://docs.world.org/mini-apps/commands/verify.
