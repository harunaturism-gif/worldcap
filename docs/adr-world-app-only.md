# ADR: World App-only distribution

Date: 2026-08-31  
Status: Accepted

## Decision

WorldCAP production distribution is exclusively through World App. World Chain is the only production chain, WLD is the only user-facing currency, and MiniKit plus the World App wallet remain the production interaction layer.

No standalone consumer WorldCAP product, alternate wallet rail, browser authentication path, browser payment fallback, or alternate payment rail is planned.

Privacy-safe public manifests, commitment records, CAP aggregates, and Verify Draw responses may remain browser-readable. They are public verification artifacts, not a separate product: they cannot purchase, own, claim, manage, transfer, or renew Titles.

## Consequences

- World ID, World Pay, Title ownership, Wallet, Monthly Human Claim, Genesis Journey, and collection flows are tested only as World App Mini App flows.
- World Chain Sepolia is the beta chain; World Chain is the only eventual production chain.
- Public verification endpoints remain unauthenticated and read-only so independent reviewers can reproduce results.
- Any future proposal for another consumer distribution or payment rail requires a new ADR and explicit product, security, legal, and compliance approval.
