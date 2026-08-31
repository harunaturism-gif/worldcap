export const EXPECTED_WORLD_ID_ACTION = 'worldprize-login';

export interface WorldIdConfig {
  rpId: string;
  signingKey: string;
  action: typeof EXPECTED_WORLD_ID_ACTION;
}

export interface PersistenceConfig {
  mode: 'supabase' | 'development-memory';
  supabaseUrl?: string;
  serviceRoleKey?: string;
}

export function isDevelopmentAuthEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV === 'development'
    && environment.WORLDPRIZE_ENV === 'development'
    && environment.ENABLE_DEV_AUTH === 'true';
}

export function isValidWorldRpId(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && /^rp_[A-Za-z0-9_-]{4,}$/.test(value);
}

function isValidSigningKey(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && /^[0-9a-fA-F]{64,}$/.test(value) && value.length % 2 === 0;
}

export function createWorldIdConfig(environment: NodeJS.ProcessEnv): WorldIdConfig | null {
  const rpId = environment.WORLD_RP_ID;
  const signingKey = environment.WORLD_RP_SIGNING_KEY;
  const action = environment.WORLD_ID_ACTION;
  if (!isValidWorldRpId(rpId) || !isValidSigningKey(signingKey) || action !== EXPECTED_WORLD_ID_ACTION) return null;
  return { rpId, signingKey, action };
}

export function createPersistenceConfig(environment: NodeJS.ProcessEnv): PersistenceConfig | null {
  const isDevelopment = environment.NODE_ENV === 'development';
  const useMemory = environment.ENABLE_DEV_MOCK_PERSISTENCE === 'true';
  const supabaseUrl = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (isDevelopment && useMemory && !supabaseUrl && !serviceRoleKey) return { mode: 'development-memory' };
  if (!supabaseUrl || supabaseUrl !== supabaseUrl.trim() || !serviceRoleKey || serviceRoleKey !== serviceRoleKey.trim() || serviceRoleKey.length < 32) return null;

  try {
    const parsed = new URL(supabaseUrl);
    if ((parsed.protocol !== 'https:' && !(isDevelopment && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.origin !== supabaseUrl) return null;
  } catch {
    return null;
  }
  return { mode: 'supabase', supabaseUrl, serviceRoleKey };
}
