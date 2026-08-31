import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { InternalUser } from './appSession.js';
import type { PersistenceConfig } from './config.js';

export interface IdentityRepository {
  upsertVerifiedIdentity(user: InternalUser, worldSessionId: string, rpId: string): Promise<void>;
}

export function createIdentityRepository(config: PersistenceConfig): IdentityRepository {
  if (config.mode === 'development-memory') return new DevelopmentMemoryIdentityRepository();
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'worldprize-server' } },
  });
  return new SupabaseIdentityRepository(client);
}

class SupabaseIdentityRepository implements IdentityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsertVerifiedIdentity(user: InternalUser, worldSessionId: string, rpId: string): Promise<void> {
    const now = new Date().toISOString();
    const userResult = await this.client.from('users').upsert({ id: user.id, username: user.username, updated_at: now }, { onConflict: 'id' }).select('id').single();
    if (userResult.error || userResult.data?.id !== user.id) throw new Error('User persistence failed');
    const identityResult = await this.client.from('world_identities').upsert({
      user_id: user.id,
      rp_id: rpId,
      verification_level: 'proof_of_human',
      world_session_hash: user.id.slice('user_'.length),
      last_verified_at: now,
    }, { onConflict: 'user_id' }).select('user_id').single();
    if (identityResult.error || identityResult.data?.user_id !== user.id || !worldSessionId.startsWith('session_')) throw new Error('Identity persistence failed');
    const profileResult = await this.client.from('profiles').upsert({ user_id: user.id, display_name: user.username }, { onConflict: 'user_id' }).select('user_id').single();
    if (profileResult.error || profileResult.data?.user_id !== user.id) throw new Error('Profile persistence failed');
  }
}

export class DevelopmentMemoryIdentityRepository implements IdentityRepository {
  readonly users = new Map<string, InternalUser>();
  async upsertVerifiedIdentity(user: InternalUser): Promise<void> { this.users.set(user.id, user); }
}
