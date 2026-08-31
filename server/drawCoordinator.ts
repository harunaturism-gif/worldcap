import { randomUUID } from 'node:crypto';
import type { DrawService } from './drawService.js';

export type CoordinatorStatus = 'PREPARED' | 'REQUEST_BOUND' | 'RESOLVED' | 'FAILED';

export interface DrawCoordinatorJob {
  id: string;
  drawId: string;
  provider: string;
  network: string;
  idempotencyKey: string;
  status: CoordinatorStatus;
  requestId: string | null;
  requestedAt: string | null;
  fulfilledAt: string | null;
  randomnessSeed: string | null;
  algorithmVersion: string;
  verificationMetadata: Record<string, unknown>;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  version: number;
}

export interface DrawCoordinatorStore {
  getOrCreate(drawId: string, provider: string, network: string, algorithmVersion: string): Promise<DrawCoordinatorJob>;
  save(job: DrawCoordinatorJob): Promise<DrawCoordinatorJob>;
}

export class MemoryDrawCoordinatorStore implements DrawCoordinatorStore {
  private readonly jobs = new Map<string, DrawCoordinatorJob>();
  async getOrCreate(drawId: string, provider: string, network: string, algorithmVersion: string) {
    const existing = this.jobs.get(drawId);
    if (existing) {
      if (existing.provider !== provider || existing.network !== network) throw new Error('coordinator_provider_substitution');
      return structuredClone(existing);
    }
    const job: DrawCoordinatorJob = {
      id: randomUUID(), drawId, provider, network, idempotencyKey: `draw:${drawId}`, status: 'PREPARED',
      requestId: null, requestedAt: null, fulfilledAt: null, randomnessSeed: null,
      algorithmVersion, verificationMetadata: {}, attemptCount: 0, lastAttemptAt: null, lastError: null, version: 0,
    };
    this.jobs.set(drawId, job);
    return structuredClone(job);
  }
  async save(job: DrawCoordinatorJob) {
    const existing = this.jobs.get(job.drawId);
    if (!existing || existing.id !== job.id || existing.version !== job.version) throw new Error('coordinator_stale_job');
    if (existing.requestId && existing.requestId !== job.requestId) throw new Error('randomness_request_immutable');
    if (existing.randomnessSeed && existing.randomnessSeed !== job.randomnessSeed) throw new Error('randomness_fulfillment_immutable');
    const saved = { ...structuredClone(job), version: job.version + 1 };
    this.jobs.set(job.drawId, saved);
    return structuredClone(saved);
  }
}

export class DurableDrawCoordinator {
  constructor(
    private readonly draws: DrawService,
    private readonly store: DrawCoordinatorStore,
    private readonly provider: string,
    private readonly network: string,
  ) {}

  async run(drawId: string): Promise<DrawCoordinatorJob> {
    let job = await this.store.getOrCreate(drawId, this.provider, this.network, 'worldcap-draw-v1');
    if (job.status === 'RESOLVED') return job;
    job.attemptCount += 1;
    job.lastAttemptAt = new Date().toISOString();
    job.lastError = null;
    job = await this.store.save(job);
    try {
      let fairness = await this.draws.getFairness(drawId);
      if (!fairness) throw new Error('draw_not_found');
      if (fairness.status === 'CLOSED') {
        await this.draws.requestRandomness(drawId);
        fairness = await this.draws.getFairness(drawId);
      }
      if (!fairness) throw new Error('draw_not_found');
      if (fairness.randomnessProvider !== this.provider) throw new Error('coordinator_provider_substitution');
      if (!job.requestId && fairness.randomnessRequestId) {
        job.requestId = fairness.randomnessRequestId;
        job.requestedAt = new Date().toISOString();
        job.status = 'REQUEST_BOUND';
        job = await this.store.save(job);
      }
      if (fairness.status === 'RANDOMNESS_PENDING') {
        await this.draws.resolveDraw(drawId);
        fairness = await this.draws.getFairness(drawId);
      }
      if (!fairness || fairness.status !== 'RESOLVED' || !fairness.randomnessSeed || !fairness.randomnessRequestId) throw new Error('draw_resolution_incomplete');
      if (job.requestId !== fairness.randomnessRequestId) throw new Error('randomness_request_binding_mismatch');
      job.randomnessSeed = fairness.randomnessSeed;
      job.fulfilledAt = new Date().toISOString();
      job.status = 'RESOLVED';
      job.verificationMetadata = { verificationStatus: fairness.verificationStatus, winningIndex: fairness.winningIndex, winningTitle: fairness.winningTitle };
      return this.store.save(job);
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : 'coordinator_failed';
      job.status = 'FAILED';
      return this.store.save(job);
    }
  }
}

