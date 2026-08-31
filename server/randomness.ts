import { randomBytes, randomInt } from 'node:crypto';

export interface RandomnessSample { basisPoints: number; reference: string; provider: string }

export interface ScratchRandomnessProvider {
  sample(): Promise<RandomnessSample>;
}

export class LocalScratchRandomnessProvider implements ScratchRandomnessProvider {
  async sample(): Promise<RandomnessSample> {
    return { basisPoints: randomInt(0, 10_000), reference: `local_${randomBytes(16).toString('hex')}`, provider: 'local-server-crypto' };
  }
}

export class FutureVerifiableScratchRandomnessProvider implements ScratchRandomnessProvider {
  async sample(): Promise<RandomnessSample> {
    throw new Error('Verifiable randomness is not configured');
  }
}

/** @deprecated Import ScratchRandomnessProvider in new code. */
export type RandomnessProvider = ScratchRandomnessProvider;
/** @deprecated Import LocalScratchRandomnessProvider in new code. */
export const LocalRandomnessProvider = LocalScratchRandomnessProvider;
