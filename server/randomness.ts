import { randomBytes, randomInt } from 'node:crypto';

export interface RandomnessSample { basisPoints: number; reference: string; provider: string }

export interface RandomnessProvider {
  sample(): Promise<RandomnessSample>;
}

export class LocalRandomnessProvider implements RandomnessProvider {
  async sample(): Promise<RandomnessSample> {
    return { basisPoints: randomInt(0, 10_000), reference: `local_${randomBytes(16).toString('hex')}`, provider: 'local-server-crypto' };
  }
}

export class FutureVerifiableRandomnessProvider implements RandomnessProvider {
  async sample(): Promise<RandomnessSample> {
    throw new Error('Verifiable randomness is not configured');
  }
}

