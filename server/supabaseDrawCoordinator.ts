import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PersistenceConfig } from './config.js';
import type { DrawRandomnessProvider, RandomnessRequest, RandomnessResult } from './drawRandomness.js';
import { operationalLog } from './structuredLogger.js';

export type PersistedCoordinatorStatus = 'prepared' | 'request_bound' | 'fulfilled' | 'resolved' | 'failed';

export interface PersistedCoordinatorJob {
  drawId: string;
  provider: string;
  network: string;
  status: PersistedCoordinatorStatus;
  requestId: string | null;
  transactionHash: string | null;
  requestBlock: bigint | null;
  randomnessSeed: string | null;
  proofReference: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface DrawCoordinatorPersistence {
  prepare(drawId: string, provider: string, network: string): Promise<PersistedCoordinatorJob>;
  get(drawId: string): Promise<PersistedCoordinatorJob | null>;
  bind(drawId: string, request: RandomnessRequest): Promise<void>;
  fulfill(drawId: string, provider: string, network: string, result: RandomnessResult): Promise<void>;
  resolve(drawId: string, requestId: string): Promise<void>;
  fail(drawId: string, reason: string): Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('coordinator_persistence_invalid');
  return value as Record<string, unknown>;
}

function parseJob(value: unknown): PersistedCoordinatorJob {
  const row = record(value);
  const text = (key: string) => { const item = row[key]; if (typeof item !== 'string') throw new Error('coordinator_persistence_invalid'); return item; };
  const nullable = (key: string) => { const item = row[key]; if (item !== null && typeof item !== 'string') throw new Error('coordinator_persistence_invalid'); return item as string | null; };
  const attempt = row.attempt_count;
  if (!Number.isSafeInteger(attempt)) throw new Error('coordinator_persistence_invalid');
  return {
    drawId: text('draw_id'), provider: text('provider'), network: text('network'), status: text('status') as PersistedCoordinatorStatus,
    requestId: nullable('provider_request_id'), transactionHash: nullable('request_transaction_hash'),
    requestBlock: row.request_block === null ? null : BigInt(text('request_block')),
    randomnessSeed: nullable('randomness_seed'), proofReference: nullable('proof_reference'),
    attemptCount: attempt as number, lastError: nullable('last_error'),
  };
}

export class SupabaseDrawCoordinatorPersistence implements DrawCoordinatorPersistence {
  constructor(private readonly client: SupabaseClient) {}
  async prepare(drawId: string, provider: string, network: string) {
    const { error } = await this.client.rpc('worldcap_prepare_randomness', { p_draw_id: drawId, p_provider: provider, p_network: network });
    if (error) throw new Error('coordinator_prepare_failed');
    const job = await this.get(drawId); if (!job) throw new Error('coordinator_job_missing'); return job;
  }
  async get(drawId: string) {
    const { data, error } = await this.client.from('draw_coordinator_jobs').select('draw_id,provider,network,status,provider_request_id,request_transaction_hash,request_block,randomness_seed,proof_reference,attempt_count,last_error').eq('draw_id', drawId).maybeSingle();
    if (error) throw new Error('coordinator_read_failed');
    return data ? parseJob(data) : null;
  }
  async bind(drawId: string, request: RandomnessRequest) {
    if (!request.transactionHash || request.requestBlock === undefined) throw new Error('coordinator_request_evidence_missing');
    const { error } = await this.client.rpc('worldcap_bind_randomness_request', {
      p_draw_id: drawId, p_provider_request_id: request.requestId, p_transaction_hash: request.transactionHash,
      p_request_block: request.requestBlock.toString(), p_requested_at: request.requestedAt,
    });
    if (error) throw new Error('coordinator_bind_failed');
  }
  async fulfill(drawId: string, provider: string, network: string, result: RandomnessResult) {
    if (!result.proofReference) throw new Error('coordinator_external_proof_missing');
    const { error } = await this.client.rpc('worldcap_fulfill_randomness', {
      p_draw_id: drawId, p_provider: provider, p_network: network, p_provider_request_id: result.requestId,
      p_seed: result.seed, p_fulfilled_at: result.fulfilledAt, p_proof_reference: result.proofReference,
    });
    if (error) throw new Error('coordinator_fulfillment_failed');
  }
  async resolve(drawId: string, requestId: string) {
    const { error } = await this.client.rpc('worldcap_resolve_draw', { p_draw_id: drawId, p_provider_request_id: requestId });
    if (error) throw new Error('coordinator_resolution_failed');
  }
  async fail(drawId: string, reason: string) {
    const { error } = await this.client.from('draw_coordinator_jobs').update({ status: 'failed', last_error: reason.slice(0, 200), updated_at: new Date().toISOString() }).eq('draw_id', drawId).neq('status', 'resolved');
    if (error) throw new Error('coordinator_failure_persistence_failed');
  }
}

export class SupabaseDurableDrawCoordinator {
  constructor(
    private readonly persistence: DrawCoordinatorPersistence,
    private readonly randomness: DrawRandomnessProvider,
    private readonly provider: string,
    private readonly network: string,
  ) {}

  async run(drawId: string): Promise<PersistedCoordinatorJob> {
    let job = await this.persistence.prepare(drawId, this.provider, this.network);
    if (job.provider !== this.provider || job.network !== this.network) throw new Error('coordinator_provider_substitution');
    if (job.status === 'resolved') return job;
    try {
      if (!job.requestId) {
        const request = await this.randomness.requestRandomness(drawId);
        if (request.drawId !== drawId || request.provider !== this.provider || request.network !== this.network) throw new Error('coordinator_request_binding_mismatch');
        await this.persistence.bind(drawId, request);
        operationalLog('randomness_request', { drawId, requestId: request.requestId, provider: request.provider });
        job = (await this.persistence.get(drawId))!;
      }
      if (!job.requestId) throw new Error('coordinator_request_missing');
      if (job.status === 'request_bound' || job.status === 'failed') {
        const result = await this.randomness.getRandomness(job.requestId);
        if (result.requestId !== job.requestId || result.provider !== job.provider) throw new Error('coordinator_fulfillment_binding_mismatch');
        await this.persistence.fulfill(drawId, job.provider, job.network, result);
        operationalLog('randomness_fulfillment', { drawId, requestId: result.requestId, provider: result.provider });
        job = (await this.persistence.get(drawId))!;
      }
      if (job.status === 'fulfilled') {
        const requestId = job.requestId;
        if (!requestId) throw new Error('coordinator_request_missing');
        await this.persistence.resolve(drawId, requestId);
        operationalLog('draw_resolution', { drawId, status: 'resolved' });
      }
      const completed = await this.persistence.get(drawId);
      if (!completed) throw new Error('coordinator_job_missing');
      return completed;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'coordinator_failed';
      if (reason === 'witnet_randomness_pending') return (await this.persistence.get(drawId)) ?? job;
      await this.persistence.fail(drawId, reason);
      operationalLog('randomness_coordinator_failure', { drawId, reason });
      return (await this.persistence.get(drawId)) ?? { ...job, status: 'failed', lastError: reason };
    }
  }
}

export function createSupabaseDrawCoordinatorPersistence(config: PersistenceConfig): SupabaseDrawCoordinatorPersistence {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  return new SupabaseDrawCoordinatorPersistence(createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'worldcap-draw-coordinator' } },
  }));
}
