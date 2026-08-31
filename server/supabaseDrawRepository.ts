import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PersistenceConfig } from './config.js';
import type { DrawRepository } from './drawRepository.js';
import { DRAW_ALGORITHM_VERSION, DRAW_MANIFEST_VERSION, type DrawManifest, type DrawRecord, type PublicManifestEntry } from './drawTypes.js';
import { parseUnitString } from './tokenUnits.js';

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`invalid_draw_${field}`);
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('invalid_draw_nullable_string');
  return value;
}

function parseDraw(value: Record<string, unknown>): DrawRecord {
  const allowed = value.allowed_tier_codes;
  if (!Array.isArray(allowed) || !allowed.every((item) => typeof item === 'string')) throw new Error('invalid_draw_allowed_tiers');
  const eligibleTitleCount = parseUnitString(stringValue(value.eligible_title_count, 'eligible_count'));
  const winningIndex = value.winning_index === null ? null : parseUnitString(stringValue(value.winning_index, 'winning_index'));
  return {
    id: stringValue(value.id, 'id'), campaignId: nullableString(value.campaign_id),
    eligibilityScope: stringValue(value.eligibility_scope, 'eligibility_scope') as DrawRecord['eligibilityScope'],
    allowedTierCodes: allowed, opensAt: stringValue(value.opens_at, 'opens_at'), closesAt: stringValue(value.closes_at, 'closes_at'),
    status: stringValue(value.status, 'status').toUpperCase() as DrawRecord['status'], eligibleTitleCount,
    eligibilityCommitment: nullableString(value.eligibility_commitment), manifestVersion: DRAW_MANIFEST_VERSION,
    algorithmVersion: DRAW_ALGORITHM_VERSION, randomnessProvider: nullableString(value.randomness_provider),
    randomnessRequestId: nullableString(value.randomness_request_id), randomnessSeed: nullableString(value.randomness_seed),
    winningIndex, winningTitleId: nullableString(value.winning_title_id), finalizedAt: nullableString(value.finalized_at),
    payoutStatus: stringValue(value.payout_status, 'payout_status') as DrawRecord['payoutStatus'],
  };
}

function parseManifest(value: Record<string, unknown>): DrawManifest {
  const publicManifest = value.public_manifest;
  if (typeof publicManifest !== 'object' || publicManifest === null || Array.isArray(publicManifest)) throw new Error('invalid_draw_manifest');
  const document = publicManifest as Record<string, unknown>;
  if (!Array.isArray(document.entries)) throw new Error('invalid_draw_manifest_entries');
  const entries: PublicManifestEntry[] = document.entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('invalid_draw_manifest_entry');
    const item = entry as Record<string, unknown>;
    return { index: stringValue(item.index, 'manifest_index'), titleId: stringValue(item.titleId, 'manifest_title'), serial: stringValue(item.serial, 'manifest_serial'), tier: stringValue(item.tier, 'manifest_tier'), campaignId: stringValue(item.campaignId, 'manifest_campaign') };
  });
  return {
    drawId: stringValue(value.draw_id, 'manifest_draw_id'), version: DRAW_MANIFEST_VERSION,
    generatedAt: stringValue(value.generated_at, 'manifest_generated_at'),
    eligibleCount: stringValue(value.eligible_count, 'manifest_count'),
    eligibilityCommitment: stringValue(value.eligibility_commitment, 'manifest_commitment'), entries,
  };
}

class SupabaseReadOnlyDrawRepository implements DrawRepository {
  constructor(private readonly client: SupabaseClient) {}
  async create(): Promise<DrawRecord> { throw new Error('production_draw_mutation_worker_not_configured'); }
  async update(): Promise<DrawRecord> { throw new Error('production_draw_mutation_worker_not_configured'); }
  async saveManifest(): Promise<void> { throw new Error('production_draw_mutation_worker_not_configured'); }

  async get(drawId: string): Promise<DrawRecord | null> {
    const { data, error } = await this.client.from('draws').select('id,campaign_id,eligibility_scope,allowed_tier_codes,opens_at,closes_at,status,eligible_title_count,eligibility_commitment,manifest_version,algorithm_version,randomness_provider,randomness_request_id,randomness_seed,winning_index,winning_title_id,finalized_at,payout_status').eq('id', drawId).maybeSingle();
    if (error) throw new Error('draw_read_failed');
    return data ? parseDraw(data as Record<string, unknown>) : null;
  }

  async getManifest(drawId: string): Promise<DrawManifest | null> {
    const { data, error } = await this.client.from('draw_manifests').select('draw_id,manifest_version,eligible_count,eligibility_commitment,public_manifest,generated_at').eq('draw_id', drawId).maybeSingle();
    if (error) throw new Error('draw_manifest_read_failed');
    return data ? parseManifest(data as Record<string, unknown>) : null;
  }
}

export function createSupabaseReadOnlyDrawRepository(config: PersistenceConfig): DrawRepository {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  return new SupabaseReadOnlyDrawRepository(createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }, global: { headers: { 'X-Client-Info': 'worldcap-draw-read-server' } },
  }));
}
