import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnvironment } from './environment-policy.mjs';

const valid = {
  NODE_ENV: 'production', WORLDPRIZE_ENV: 'beta', APP_ORIGIN: 'https://worldcap-beta.vercel.app',
  WORLD_RP_ID: 'rp_worldcap', WORLD_RP_SIGNING_KEY: 'ab'.repeat(32), WORLD_ID_ACTION: 'worldprize-login',
  WORLD_APP_ID: 'app_worldcap', VITE_WORLD_APP_ID: 'app_worldcap',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(32),
  APP_SESSION_SECRET: 'a'.repeat(32), APP_IDENTITY_SECRET: 'b'.repeat(32),
  ENABLE_DEV_AUTH: 'false', ENABLE_DEV_FAKE_PAYMENTS: 'false', ENABLE_DEV_MOCK_PERSISTENCE: 'false', ENABLE_DEV_DRAW_RANDOMNESS: 'false',
  ENABLE_BETA_DEMO_PURCHASES: 'true', WORLD_DEVELOPER_API_KEY: '',
  WORLD_CHAIN_CHAIN_ID: '4801', WITNET_NETWORK: 'world-chain-sepolia', WORLD_CHAIN_SEPOLIA_RPC_URL: 'https://worldchain-sepolia.g.alchemy.com/public',
  WITNET_RANDOMNESS_CONTRACT: `0x${'1'.repeat(40)}`, DRAW_COMMITMENT_REGISTRY_ADDRESS: `0x${'2'.repeat(40)}`,
  ENABLE_BACKGROUND_WORKERS: 'false', VERCEL: '1',
};

test('accepts a fail-closed Vercel beta configuration', () => assert.deepEqual(validateEnvironment(valid), []));
test('rejects browser secrets and development capabilities', () => {
  const failures = validateEnvironment({ ...valid, VITE_WORLD_RP_SIGNING_KEY: 'secret', ENABLE_DEV_DRAW_RANDOMNESS: 'true' });
  assert(failures.includes('browser_secret:VITE_WORLD_RP_SIGNING_KEY'));
  assert(failures.includes('ENABLE_DEV_DRAW_RANDOMNESS'));
});
test('requires exactly one beta acquisition rail', () => {
  assert(validateEnvironment({ ...valid, WORLD_DEVELOPER_API_KEY: 'api_live' }).includes('BETA_PAYMENT_MODE'));
  assert(validateEnvironment({ ...valid, ENABLE_BETA_DEMO_PURCHASES: 'false' }).includes('BETA_PAYMENT_MODE'));
});
test('rejects zero trust-infrastructure addresses and Vercel workers', () => {
  const failures = validateEnvironment({ ...valid, WITNET_RANDOMNESS_CONTRACT: `0x${'0'.repeat(40)}`, ENABLE_BACKGROUND_WORKERS: 'true' });
  assert(failures.includes('WITNET_RANDOMNESS_CONTRACT'));
  assert(failures.includes('ENABLE_BACKGROUND_WORKERS'));
});
