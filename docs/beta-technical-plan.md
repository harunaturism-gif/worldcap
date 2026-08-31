# Closed technical beta plan

Starting point: frozen Phase 3A commit `aa6c1d5e4cf61f7b68658fdad7bdc434f5e069a1`.

The beta proves the product and trust loop without representing simulated accounting as real WLD, funded custody, or authorization for a real-money prize product.

## DONE

- World ID 4.x session authentication and fail-closed server verification.
- World Pay verification boundary, atomic/idempotent title issuance, integer accounting, and 60/10/20/10 allocation.
- Campaign-configured Accessible, Purple, and Gold titles; original/current ownership, provenance, lifecycle, and renewal state.
- Persisted single-use scratch results; scratched titles remain owned and draw eligible; simulated winnings are non-spendable.
- Phase 3A manifest commitment, unbiased deterministic winner selection, draw state machine, privacy-safe fairness API, Verify Draw v1, and modeled vault/scratch/renewal liabilities.
- Frozen baseline re-verified: 53 tests, frontend/server typecheck, lint, frontend build, and server build all pass.

## BUILD NOW

- Transactional Supabase close-draw RPC with deterministic snapshot and retry/concurrency controls.
- Restart-safe coordinator records and idempotent request/fulfillment/resolution transitions.
- Configurable World Chain Sepolia Witnet adapter up to the funded transaction/provider-address boundary.
- Canonical privacy-safe public artifacts with local and Supabase publication backends.
- Minimal non-custodial append-only commitment registry, tests, ABI, and deployment script.
- Verify Draw V2 component verification and optional anchor checks.
- Consumer Fairness/Draw Explorer UI and standalone-browser read-only path.
- Strict `beta` runtime, explicit non-monetary demo mode, reconciliation worker, structured events, `/health`, `/ready`, deployment docs, and canonical beta smoke test.

## BLOCKED EXTERNALLY

- Live World Chain Sepolia randomness requests require a confirmed current Witnet Randomness contract address, Sepolia RPC availability, a funded operator wallet, and transaction-signing authority.
- Live commitment anchoring requires a funded World Chain Sepolia deployer key and contract verification access. No address will be claimed until deployment is observed and verified.
- Persistent end-to-end beta requires a provisioned Supabase project with migrations applied and storage/configuration credentials.
- Real World ID beta requires Developer Portal app/RP configuration, production/beta origin registration, and signing credentials.
- World Pay remains a Mini App production rail; a closed beta may use only an explicitly labeled non-monetary demo rail until real-money operation is approved.

## DEFER TO PRODUCTION

- Mainnet, WLD custody, funded Prize Vault contracts, real scratch/draw/jackpot payouts, automatic real settlement, and withdrawals.
- Final tier economics, scratch odds, renewal funding source, and prize promises.
- Marketplace, NFT minting, staking, DAO, custom token, and regulatory workarounds.
- Public launch until legal/compliance approval, independent security review, custody audit, incident procedures, and launch-market controls are complete.

## Current documentation findings

- World’s current primary documentation lists Witnet randomness support for World Chain and World Chain Sepolia, and identifies Sepolia as chain ID `4801` with the public Alchemy RPC. Witnet documents asynchronous paid `randomize()` requests and block-bound `fetchRandomnessAfter`/status methods.
- Witnet’s current randomness address page does not visibly publish a World Chain-specific address in its rendered address list. The beta therefore requires an explicit configured address and validates its bytecode/network rather than assuming a copied multi-chain address.
- World ID 4.x uses `@worldcoin/idkit-core` for browser/vanilla flows. Inside World App native transport is used; outside it the connector URL supports QR/deep-link completion. The existing server RP-signature and `/api/v4/verify/{rp_id}` path remains valid for both environments.
