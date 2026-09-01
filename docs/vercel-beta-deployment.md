# Vercel beta deployment

This runbook creates a preview/beta origin for the World App Mini App and its read-only public verification surface. It does not create a standalone WorldCAP product or authorize real-money payouts.

## Project and branch

- Create a dedicated Vercel project named `worldcap-beta` linked only to `harunaturism-gif/worldcap`.
- Deploy `release/worldcap-beta-candidate`; never deploy `main` for this beta.
- Keep production promotion disabled. Use a preview deployment and record its deployment ID and Git SHA.

The root `server.ts` exports Express as the Vercel Node entrypoint. Vite builds into `public/`, which Express also serves as an SPA fallback. Frontend API calls default to the same origin.

## Gates before deployment

1. `npm ci`
2. `npm run validate:env -- --repository --template`
3. `npm test`
4. `npm run typecheck:web`
5. `npm run typecheck:server`
6. `npm run lint`
7. `npm run build:web`
8. `npm run build:server`
9. `forge test --root contracts` when Foundry is available
10. Apply and verify beta Supabase migrations through `202609010010_economics_five_winner_quarterly_v1.sql` using `supabase/verify-beta.sql`.

Configure Preview variables from `docs/environment-matrix.md`. Add secrets through Vercel sensitive environment variables; never pass them in command arguments or commit local `.env` files.

## Deploy and verify

Use a prebuilt preview only after the release-candidate integration is complete:

```text
vercel pull --yes --environment=preview
vercel build
vercel deploy --prebuilt
```

Use `vercel curl` if deployment protection is enabled. The canonical smoke gate is:

```text
BETA_BASE_URL=https://<preview> npm run smoke:beta
```

Do not update the World Developer Portal App URL until `/health`, `/ready`, the route smoke checks, and the deployed SHA all pass. Then set the exact HTTPS origin for app `app_2524a16fcc996eebbc76629eddcd0993`.
