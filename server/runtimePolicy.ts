export type WorldcapRuntime = 'development' | 'beta' | 'testnet' | 'production';

export interface RuntimePolicy {
  runtime: WorldcapRuntime;
  allowMemoryPersistence: boolean;
  allowDeterministicDraws: boolean;
  allowFakePayments: boolean;
  allowDemoPurchases: boolean;
  requirePersistentSupabase: boolean;
}

export function createRuntimePolicy(environment: NodeJS.ProcessEnv): RuntimePolicy {
  const configured = environment.WORLDPRIZE_ENV;
  const runtime: WorldcapRuntime = configured === 'development' || configured === 'beta' || configured === 'testnet' || configured === 'production' ? configured : (() => { throw new Error('runtime_invalid'); })();
  const dev = runtime === 'development' && environment.NODE_ENV === 'development';
  const demo = environment.ENABLE_BETA_DEMO_PURCHASES === 'true';
  if (!dev && (environment.ENABLE_DEV_AUTH === 'true' || environment.ENABLE_DEV_FAKE_PAYMENTS === 'true' || environment.ENABLE_DEV_MOCK_PERSISTENCE === 'true' || environment.ENABLE_DEV_DRAW_RANDOMNESS === 'true')) throw new Error('development_capability_forbidden');
  if (runtime === 'production' && demo) throw new Error('production_demo_purchase_forbidden');
  if ((runtime === 'beta' || runtime === 'testnet') && environment.NODE_ENV === 'development') throw new Error('beta_requires_production_process');
  return {
    runtime, allowMemoryPersistence: dev, allowDeterministicDraws: dev,
    allowFakePayments: dev, allowDemoPurchases: runtime === 'beta' && demo,
    requirePersistentSupabase: runtime !== 'development',
  };
}

export function validateProviderReadiness(policy: RuntimePolicy, environment: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  if (policy.runtime !== 'development') {
    if (!environment.WORLD_CHAIN_SEPOLIA_RPC_URL) missing.push('WORLD_CHAIN_SEPOLIA_RPC_URL');
    if (!environment.WITNET_RANDOMNESS_CONTRACT) missing.push('WITNET_RANDOMNESS_CONTRACT');
    if (!environment.DRAW_COMMITMENT_REGISTRY_ADDRESS) missing.push('DRAW_COMMITMENT_REGISTRY_ADDRESS');
  }
  return missing;
}
