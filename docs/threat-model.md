# Threat Model

## Assets
- User WLD
- Prize Funds
- Annual Jackpot
- Platform Treasury
- Growth Treasury
- Title Ownership
- Title Provenance
- Purchase Verification
- Scratch Results
- Draw Eligibility
- Renewal Liabilities
- World ID Sessions
- Supabase Service Credentials

## Adversaries
- Malicious User
- Bot
- Compromised Browser
- Compromised Backend
- Malicious Administrator
- Leaked service-role key
- Replay Attacker
- Concurrent Request Attacker
- Payment Replay Attacker
- Future Randomness Manipulation
- Future Vault Abuse

## Trust Boundaries
Explicit mapping:
- **Browser** → **API**: The browser is entirely untrusted. All requests must be authenticated via World ID session. Inputs are sanitized, and operations are authorized on the backend.
- **API** → **Supabase**: Communication relies on the `service-role` key. The API is authoritative for economy/auth data. No direct browser-to-Supabase interactions are allowed (RLS restricts all paths).
- **API** → **World Developer Portal**: Server-side communication strictly to verify World Pay transactions securely.
- **API** → **World Wallet**: Out-of-band payment validation ensures real WLD transfers match intended recipients and amounts.
- **API** → **Future Smart Contracts**: To be defined in Phase 3.
- **API** → **Future Randomness Provider**: To be defined in Phase 3.

## Reliance on Trusted Backend State
The system heavily relies on the backend for:
- Authoritative token and WLD base-unit integer math.
- Verification and idempotent handling of World Pay intent references (`payment_reference` locking).
- Randomness generation (currently internal server crypto, until Phase 3 VRF integration).
- Execution of service-role-only Supabase RPCs (`worldprize_complete_purchase`, `worldprize_reveal_scratch`, `worldprize_get_snapshot`) which enforce core business and economic logic within Postgres atomicity guarantees.
