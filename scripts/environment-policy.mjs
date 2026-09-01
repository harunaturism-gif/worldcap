const HEX_64 = /^[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;

const SERVER_SECRET_MARKERS = ['SECRET', 'PRIVATE', 'SERVICE_ROLE', 'SIGNING_KEY', 'API_KEY', 'TOKEN'];
const DEVELOPMENT_FLAGS = [
  'ENABLE_DEV_AUTH',
  'ENABLE_DEV_FAKE_PAYMENTS',
  'ENABLE_DEV_MOCK_PERSISTENCE',
  'ENABLE_DEV_DRAW_RANDOMNESS',
];

function validHttpsOrigin(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function validAddress(value) {
  return ADDRESS.test(value ?? '') && !ZERO_ADDRESS.test(value ?? '');
}

export function validateEnvironment(environment, options = {}) {
  const runtime = options.runtime ?? environment.WORLDPRIZE_ENV;
  const platform = options.platform ?? (environment.VERCEL ? 'vercel' : 'generic');
  const errors = [];
  const require = (name, condition) => { if (!condition) errors.push(name); };

  for (const name of Object.keys(environment)) {
    if (name.startsWith('VITE_') && SERVER_SECRET_MARKERS.some((marker) => name.includes(marker))) errors.push(`browser_secret:${name}`);
  }

  if (runtime !== 'beta' && runtime !== 'production') errors.push('WORLDPRIZE_ENV');
  require('NODE_ENV', environment.NODE_ENV === 'production');
  require('APP_ORIGIN', validHttpsOrigin(environment.APP_ORIGIN));
  require('WORLD_RP_ID', /^rp_[A-Za-z0-9_-]{4,}$/.test(environment.WORLD_RP_ID ?? ''));
  require('WORLD_RP_SIGNING_KEY', HEX_64.test(environment.WORLD_RP_SIGNING_KEY ?? ''));
  require('WORLD_ID_ACTION', environment.WORLD_ID_ACTION === 'worldprize-login');
  require('WORLD_APP_ID', /^app_[A-Za-z0-9_-]{4,}$/.test(environment.WORLD_APP_ID ?? ''));
  require('VITE_WORLD_APP_ID', environment.VITE_WORLD_APP_ID === environment.WORLD_APP_ID);
  require('SUPABASE_URL', validHttpsOrigin(environment.SUPABASE_URL));
  require('SUPABASE_SERVICE_ROLE_KEY', (environment.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0) >= 32);
  require('APP_SESSION_SECRET', (environment.APP_SESSION_SECRET?.length ?? 0) >= 32);
  require('APP_IDENTITY_SECRET', (environment.APP_IDENTITY_SECRET?.length ?? 0) >= 32);
  require('APP_SECRET_SEPARATION', environment.APP_SESSION_SECRET !== environment.APP_IDENTITY_SECRET);

  for (const flag of DEVELOPMENT_FLAGS) require(flag, environment[flag] !== 'true');
  if (runtime === 'production') require('ENABLE_BETA_DEMO_PURCHASES', environment.ENABLE_BETA_DEMO_PURCHASES !== 'true');
  if (runtime === 'beta') {
    const demo = environment.ENABLE_BETA_DEMO_PURCHASES === 'true';
    const developerKey = Boolean(environment.WORLD_DEVELOPER_API_KEY);
    require('BETA_PAYMENT_MODE', demo !== developerKey);
  }

  require('WORLD_CHAIN_CHAIN_ID', environment.WORLD_CHAIN_CHAIN_ID === '4801');
  require('WITNET_NETWORK', environment.WITNET_NETWORK === 'world-chain-sepolia');
  require('WORLD_CHAIN_SEPOLIA_RPC_URL', validHttpsUrl(environment.WORLD_CHAIN_SEPOLIA_RPC_URL));
  require('WITNET_RANDOMNESS_CONTRACT', validAddress(environment.WITNET_RANDOMNESS_CONTRACT));
  require('DRAW_COMMITMENT_REGISTRY_ADDRESS', validAddress(environment.DRAW_COMMITMENT_REGISTRY_ADDRESS));
  if (platform === 'vercel') require('ENABLE_BACKGROUND_WORKERS', environment.ENABLE_BACKGROUND_WORKERS !== 'true');

  return [...new Set(errors)].sort();
}

export function findUnsafeTemplateNames(names) {
  return names.filter((name) => name.startsWith('VITE_') && SERVER_SECRET_MARKERS.some((marker) => name.includes(marker))).sort();
}
