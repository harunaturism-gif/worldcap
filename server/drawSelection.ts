import { createHash } from 'node:crypto';
import { DRAW_ALGORITHM_VERSION } from './drawTypes.js';

const SAMPLE_SPACE = 1n << 256n;
const MAX_REJECTION_ATTEMPTS = 256;

function hashToBigInt(value: string): bigint {
  return BigInt(`0x${createHash('sha256').update(value).digest('hex')}`);
}

function requireSeed(randomness: bigint): void {
  if (randomness < 0n || randomness >= SAMPLE_SPACE) throw new Error('randomness_must_be_256_bit_unsigned');
}

/**
 * Maps a uniform 256-bit value to [0, eligibleCount) without modulo bias.
 * Values in the incomplete high tail are deterministically rehashed until they
 * fall within the largest multiple of eligibleCount below 2^256.
 */
export function selectWinningIndex(randomness: bigint, eligibleCount: bigint): bigint {
  requireSeed(randomness);
  if (eligibleCount <= 0n || eligibleCount > SAMPLE_SPACE) throw new Error('eligible_count_invalid');
  if (eligibleCount === 1n) return 0n;
  const acceptanceLimit = SAMPLE_SPACE - (SAMPLE_SPACE % eligibleCount);
  let sample = randomness;
  for (let retry = 0; retry < MAX_REJECTION_ATTEMPTS; retry += 1) {
    if (sample < acceptanceLimit) return sample % eligibleCount;
    sample = hashToBigInt(`${DRAW_ALGORITHM_VERSION}|rejection|${randomness.toString(16).padStart(64, '0')}|${retry + 1}`);
  }
  throw new Error('randomness_rejection_limit_exceeded');
}

export function parseRandomnessSeed(seed: string): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) throw new Error('randomness_seed_invalid');
  return BigInt(seed);
}

export function deriveWinnerRandomness(seed: bigint, drawId: string, winnerOrdinal: bigint): bigint {
  requireSeed(seed);
  if (!drawId || winnerOrdinal < 0n) throw new Error('winner_derivation_input_invalid');
  return hashToBigInt(`${DRAW_ALGORITHM_VERSION}|winner|${seed.toString(16).padStart(64, '0')}|${drawId}|${winnerOrdinal.toString()}`);
}

/** Deterministic partial Fisher-Yates sampling with O(winnerCount) memory. */
export function selectUniqueWinningIndices(seed: bigint, eligibleCount: bigint, winnerCount: bigint, drawId: string): bigint[] {
  requireSeed(seed);
  if (eligibleCount <= 0n || winnerCount < 0n || winnerCount > eligibleCount) throw new Error('winner_count_invalid');
  if (winnerCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('winner_count_too_large');
  const swaps = new Map<bigint, bigint>();
  const winners: bigint[] = [];
  for (let ordinal = 0n; ordinal < winnerCount; ordinal += 1n) {
    const remaining = eligibleCount - ordinal;
    const position = selectWinningIndex(deriveWinnerRandomness(seed, drawId, ordinal), remaining);
    const winner = swaps.get(position) ?? position;
    const lastPosition = remaining - 1n;
    const lastValue = swaps.get(lastPosition) ?? lastPosition;
    if (position !== lastPosition) swaps.set(position, lastValue);
    swaps.delete(lastPosition);
    winners.push(winner);
  }
  return winners;
}
