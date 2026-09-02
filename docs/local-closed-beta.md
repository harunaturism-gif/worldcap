# CAP local closed beta

This product-tour environment is local only. It never represents simulated WLD or CAP as real, never deploys contracts, and never substitutes a randomness provider.

Start with `npm run dev`, then open `http://127.0.0.1:5173/` and use the explicit local development entry.

The ignored `.env.development` enables development authentication, in-memory persistence, fake payment verification, deterministic development randomness, the local product-tour seed, and the fixed local founder user. These capabilities are rejected outside `NODE_ENV=development`.

The seed includes five non-monetary demo Titles, an open Monthly Human Claim with participation registered, an active Genesis campaign, qualified and claimed internal quests, an external quest that fails closed without its provider, simulated CAP source accounting, social activity, and read-only Founder Control Center metrics.

Inspect Home, Titles, Play, Social, Wallet, Fairness, and Founder access. Draw verification remains honest: the product explains the five-winner monthly and quarterly algorithms, while external Witnet and on-chain anchoring remain explicitly unavailable until their real World Chain Sepolia boundaries exist.
