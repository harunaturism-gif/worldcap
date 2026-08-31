import { createHash } from 'node:crypto';

export interface RandomnessRequest {
  drawId: string;
  requestId: string;
  provider: string;
  requestedAt: string;
  transactionHash?: string;
  requestBlock?: bigint;
  network?: string;
}

export interface RandomnessResult {
  requestId: string;
  provider: string;
  seed: string;
  fulfilledAt: string;
  proofReference?: string;
  fulfillmentBlock?: bigint;
}

export interface DrawRandomnessProvider {
  requestRandomness(drawId: string): Promise<RandomnessRequest>;
  getRandomness(requestId: string): Promise<RandomnessResult>;
}

export class LocalDeterministicDrawRandomnessProvider implements DrawRandomnessProvider {
  private readonly requests = new Map<string, RandomnessRequest>();

  constructor(runtime: 'development' | 'test' | 'production' | 'testnet', private readonly deterministicSeed: string) {
    if (runtime !== 'development' && runtime !== 'test') throw new Error('local_draw_randomness_forbidden');
    if (deterministicSeed.length < 16) throw new Error('local_draw_randomness_seed_invalid');
  }

  async requestRandomness(drawId: string): Promise<RandomnessRequest> {
    if (!drawId) throw new Error('draw_id_required');
    const requestId = `local_draw_${createHash('sha256').update(`request|${this.deterministicSeed}|${drawId}`).digest('hex')}`;
    const request = Object.freeze({ drawId, requestId, provider: 'local-deterministic-draw-v1', requestedAt: new Date().toISOString() });
    this.requests.set(requestId, request);
    return request;
  }

  async getRandomness(requestId: string): Promise<RandomnessResult> {
    const request = this.requests.get(requestId);
    if (!request) throw new Error('randomness_request_not_found');
    const seed = `0x${createHash('sha256').update(`seed|${this.deterministicSeed}|${request.drawId}|${request.requestId}`).digest('hex')}`;
    return Object.freeze({ requestId, provider: request.provider, seed, fulfilledAt: new Date().toISOString() });
  }
}

export class VerifiableDrawRandomnessProvider implements DrawRandomnessProvider {
  async requestRandomness(): Promise<RandomnessRequest> { throw new Error('verifiable_draw_randomness_not_configured'); }
  async getRandomness(): Promise<RandomnessResult> { throw new Error('verifiable_draw_randomness_not_configured'); }
}

export function createDrawRandomnessProvider(environment: NodeJS.ProcessEnv): DrawRandomnessProvider {
  const explicitlyEnabled = environment.ENABLE_DEV_DRAW_RANDOMNESS === 'true';
  const runtime = environment.NODE_ENV === 'test' ? 'test' : environment.WORLDPRIZE_ENV;
  if (explicitlyEnabled) {
    if (runtime !== 'development' && runtime !== 'test') throw new Error('local_draw_randomness_forbidden');
    return new LocalDeterministicDrawRandomnessProvider(runtime, environment.DEV_DRAW_RANDOMNESS_SEED ?? '');
  }
  return new VerifiableDrawRandomnessProvider();
}
