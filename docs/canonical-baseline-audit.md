# Canonical Baseline Audit

## Implementation Status

### IMPLEMENTED
- **World ID Authentication**: IDKit Session Auth, server proof verification, strict origin/config checks.
- **World Pay Integration (Phase 2)**: Verified WLD payment using fake verifier in dev, strict verification of reference, mined status, chain, asset, amount, recipient, and payer address.
- **Economic Vertical Slice**: Purchase intents, unique references, atomicity of purchase.
- **Exact Accounting**: BigInt/18-decimal integer token units for exact allocation (60/10/20/10 splits).
- **Titles**: Tier-aware title issuance, original buyer tracking, ownership separation.
- **Simulated Scratch**: Scratch results generated securely on server, returned once per title, marked as unspendable liabilities.
- **Privacy Controls**: RLS with no browser policies, no balance disclosure to other users.
- **Idempotency**: Concurrent confirmation handling, preventing duplicate issuance.

### PARTIAL
- **Social Feed**: Social post persistence is present but minimal, local-session MVP UI.
- **History/Wallet UI**: Simple aggregate display for users but missing detailed breakdowns.

### NOT IMPLEMENTED
- **Phase 3 Trust Foundation**: Prize Vaults, Allocation Router, verifiable public randomness (VRF), winner selection algorithms.
- **Draw Resolution**: Draw logic and automated settlement.
- **Payouts**: Actual redemption paths.
- **Marketplace / Secondary Market**.
- **Admin Dashboard**: Analytics, treasury oversight controls.

### INTENTIONALLY DEFERRED
- **Mainnet**: Kept off mainnet until audited and Phase 3 Trust infrastructure is implemented.
- **Transfer/Gifting**: Title permanence established but transferring not yet live.
- **Custom Token**: WLD remains the singular asset.

### CONFLICT / DECISION REQUIRED
- Final tier names, prices, precise scratch prize tables.
- Fixed-WLD versus fiat-indexed pricing.

## Privacy Findings
- The application correctly fails closed.
- RLS isolates user data.
- The system properly hides exact private financial activity and exact private title ownership details from other users (`worldprize_get_snapshot` ensures isolation).
- Simulated scratch results do not affect spendable WLD balances, preventing false presentation of user assets.
