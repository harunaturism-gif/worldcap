# WorldCAP beta environment matrix

WorldCAP is a World App Mini App only. Browser-readable fairness routes are verification surfaces, not a standalone consumer product.

## Browser-visible build variables

| Variable | Beta value | Required | Notes |
| --- | --- | --- | --- |
| `VITE_WORLD_APP_ID` | WorldCAP app ID | yes | Public identifier; must equal `WORLD_APP_ID`. |
| `VITE_BACKEND_URL` | omitted | no | Production defaults to the same Vercel origin. Set only for deliberate split-origin development. |
| `VITE_ENABLE_DEV_AUTH` | `false` | yes | Development bypass; never enable in preview/beta. |
| `VITE_ENABLE_DEV_FAKE_PAYMENTS` | `false` | yes | Development-only UI capability. |

No variable containing `SECRET`, `PRIVATE`, `SERVICE_ROLE`, `SIGNING_KEY`, `API_KEY`, or `TOKEN` may use a `VITE_` prefix.

## Server-only identity and persistence

| Variable | Beta value | Required | Secret |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | yes | no |
| `WORLDPRIZE_ENV` | `beta` | yes | no |
| `APP_ORIGIN` | exact Vercel beta origin | yes | no |
| `WORLD_APP_ID` | `app_2524a16fcc996eebbc76629eddcd0993` | yes | no |
| `WORLD_RP_ID` | `rp_128e5d3a1f37d564` | yes | no |
| `WORLD_RP_SIGNING_KEY` | signer private key without `0x` | yes | yes |
| `WORLD_ID_ACTION` | `worldprize-login` | yes | no |
| `APP_SESSION_SECRET` | distinct random value, 32+ characters | yes | yes |
| `APP_IDENTITY_SECRET` | distinct random value, 32+ characters | yes | yes |
| `SUPABASE_URL` | beta project URL | yes | no |
| `SUPABASE_SERVICE_ROLE_KEY` | beta project secret/service-role key | yes | yes |

## Acquisition mode

Initial beta uses exactly one explicitly non-monetary rail:

| Variable | Value |
| --- | --- |
| `ENABLE_BETA_DEMO_PURCHASES` | `true` |
| `WORLD_DEVELOPER_API_KEY` | omitted |
| `ENABLE_DEV_FAKE_PAYMENTS` | `false` |

Demo ledger entries must never be described as verified WLD settlement. Production forbids demo acquisition.

## Trust infrastructure and workers

| Variable | Beta value | Gate |
| --- | --- | --- |
| `WORLD_CHAIN_CHAIN_ID` | `4801` | exact |
| `WITNET_NETWORK` | `world-chain-sepolia` | exact |
| `WORLD_CHAIN_SEPOLIA_RPC_URL` | verified HTTPS RPC | required |
| `WITNET_RANDOMNESS_CONTRACT` | independently confirmed non-zero address | readiness-blocking |
| `DRAW_COMMITMENT_REGISTRY_ADDRESS` | deployed non-zero registry address | readiness-blocking |
| `ENABLE_BACKGROUND_WORKERS` | `false` on Vercel | required |
| `PUBLIC_MANIFEST_BUCKET` | `worldcap-public-draws` | used by the separately operated worker |

Vercel functions are request-driven. The 15-second reconciliation/publication loop must not be enabled in Vercel; it requires a separately operated durable worker before the corresponding capability is considered live.

## Forbidden beta flags

All must be absent or `false`: `ENABLE_DEV_AUTH`, `ENABLE_DEV_FAKE_PAYMENTS`, `ENABLE_DEV_MOCK_PERSISTENCE`, and `ENABLE_DEV_DRAW_RANDOMNESS`.
