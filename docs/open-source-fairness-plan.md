# Open-Source Fairness Plan

## SHOULD BE PUBLIC
- **winner-selection algorithm**: Users must be able to independently verify that the method for picking winners from a set of eligible titles is deterministic and unbiased.
- **randomness verification**: To prove that no founder or admin manipulated the result, the integration with the randomness provider (e.g., VRF) and the seed generation logic should be transparent.
- **eligibility commitment**: The snapshot or list of titles included in a draw needs to be publicly verifiable so no titles are secretly excluded or added post-closure.
- **Prize Vault contracts**: To prove that promised prize funds exist and are locked securely for winners.
- **Allocation Router**: To verify that the 60/10/20/10 split rule is mathematically enforced on every verified purchase.
- **Verify Draw library**: An independent, open-source script or package that allows anyone to recompute the result from the public inputs.

## SHOULD REMAIN PRIVATE / NOT REQUIRED
- **secrets**: Internal keys (e.g., service-role keys, Developer API keys) must be kept private to prevent unauthorized access.
- **internal ops configuration**: Sensitive deployment architectures and load balancer configurations.
- **abuse detection details**: Publishing anti-bot and rate limiting heuristics allows malicious actors to find ways around them.
- **privileged operational tooling**: Admin dashboard code and ops scripts that could expose internal pathways or processes that aren't relevant to proving fair outcomes.
