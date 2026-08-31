# Closed technical beta deployment

This checklist deploys a technical beta. Passing it does **not** authorize real-money prize operation, custody, or payouts.

## 1. Build and infrastructure

1. Deploy the Vite output from `dist/` behind HTTPS.
2. Deploy `server/dist/index.js` as a long-running Node 20+ service. Expose only HTTPS through the platform ingress.
3. Provision a dedicated Supabase project and apply every migration in filename order through `202609010007_external_randomness_proof.sql`.
4. Confirm browser roles cannot execute service-role RPCs or read private manifest/coordinator tables.
5. Keep the frontend and API same-origin where possible. If split, set one exact `APP_ORIGIN`; wildcards are rejected.

## 2. World Developer Portal

1. Register the beta HTTPS origin and Mini App URL.
2. Configure the exact relying party ID used by `WORLD_RP_ID`.
3. Store the RP signing key only in the backend secret manager.
4. Keep `WORLD_ID_ACTION=worldprize-login` exactly.
5. Set `WORLD_APP_ID` and, only for genuine World Pay verification, `WORLD_DEVELOPER_API_KEY`.
6. Smoke-test World ID and every authenticated product flow inside World App before inviting participants. Test browser access only for the unauthenticated read-only verification surface.

## 3. Runtime variables

Set `NODE_ENV=production`, `WORLDPRIZE_ENV=beta`, `APP_ORIGIN`, strong distinct `APP_SESSION_SECRET` and `APP_IDENTITY_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, World ID/RP values, payment recipient, and app ID.

Choose exactly one acquisition rail:

- Real World Pay verification: set a Developer API key and keep `ENABLE_BETA_DEMO_PURCHASES=false`.
- Non-monetary closed-beta acquisition: omit the Developer API key and set `ENABLE_BETA_DEMO_PURCHASES=true`. The UI and ledger label every acquisition as demo; no WLD spend is recorded.

Never enable `ENABLE_DEV_AUTH`, `ENABLE_DEV_FAKE_PAYMENTS`, `ENABLE_DEV_MOCK_PERSISTENCE`, or `ENABLE_DEV_DRAW_RANDOMNESS` in beta. Startup rejects these combinations. Production additionally rejects beta demo mode.

## 4. Randomness and World Chain Sepolia

1. Pin chain ID `4801` and an HTTPS World Chain Sepolia RPC.
2. Independently confirm the current Witnet Randomness deployment address; set `WITNET_RANDOMNESS_CONTRACT`. The repository intentionally has no guessed default.
3. Configure the implemented pinned reader/coordinator with a signed `WitnetTransactionSubmitter`, funded Sepolia operator, and durable pre-broadcast transaction journal.
4. Validate deployed bytecode and provider identity before requesting randomness.
5. Never fall back to local deterministic randomness in beta or production.

World currently lists Witnet for World Chain and World Chain Sepolia: https://docs.world.org/world-chain/providers/oracles. Network information: https://docs.world.org/world-chain/quick-start/info. Witnet documents its asynchronous paid request flow at https://docs.witnet.io/smart-contracts/guides/solidity-contracts/appliances/witnetrandomness.

The validated assumptions and exact unimplemented signing boundary are recorded in `docs/witnet-world-chain-sepolia.md`.

## 5. Commitment registry

1. Install Foundry, run `forge test --root contracts`, and review the bytecode.
2. Export `WORLD_CHAIN_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and the immutable `ANCHOR_AUTHORITY`.
3. Run `contracts/script/deploy.ps1` from a secure operator environment.
4. Record the observed transaction and deployed address; verify source on the chain explorer.
5. Set `DRAW_COMMITMENT_REGISTRY_ADDRESS`. Never commit a private key or fabricate an address.

The registry anchors commitments only. It accepts no WLD, winner, prize, or payout input.

## 6. Health, smoke, and rollback

1. `GET /health` must return 200 and `status: alive`.
2. `GET /ready` must return 200 only after Supabase and required provider settings are present.
3. Execute `docs/beta-smoke-test.md` with a World App test identity, then reproduce Verify Draw from a signed-out browser as a public verification-only check.
4. Confirm `/api/draws/:id/artifact`, `/fairness`, and `/verify` expose no identity, wallet, or purchase data.
5. Monitor structured auth, payment, draw, randomness, reconciliation, and verification events without logging proofs, keys, or tokens.
6. Roll back application code to the last verified image. Database migrations are forward-only; pause workers before schema remediation. Never reopen a closed draw or replace a fulfilled randomness response during rollback.

For the long-running worker process, set `ENABLE_BACKGROUND_WORKERS=true` and a private bucket name in `PUBLIC_MANIFEST_BUCKET`. Create that bucket before startup, keep writes service-role-only, permit public reads only for immutable artifact objects, and verify that `/ready` fails when the bucket setting is absent. The payment reconciliation and manifest publication workers run in-process with overlap protection; deploy exactly one replica until distributed scheduling is configured. The Witnet coordinator remains a separately invoked operator job at the signed-transaction boundary.

## Known limitations

- Live Witnet broadcast/fulfillment and registry deployment require external keys, funds, and address verification.
- Prize Vaults, scratch inventory, and renewal liabilities are domain models—not live funded custody.
- Prizes and balances remain simulated/non-spendable; no automated payout exists.
- World Pay remains the only production payment rail. Standard browsers receive only public fairness artifacts and Verify Draw; they have no authenticated collection, wallet, scratch, ownership, or payment capability.
- Legal/compliance approval, independent security review, incident response, and custody audit are required before any real-money production launch.
