import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectWinningIndex, selectUniqueWinningIndices, parseRandomnessSeed } from './drawSelection.js';

describe('Adversarial Fuzzing', () => {

  it('verifies modulo bias boundary constraints over many boundaries', () => {
    const sampleSpace = 1n << 256n;
    const counts = [1n, 2n, 10n, 100n, 1024n, (1n << 32n) - 1n, (1n << 32n), (1n << 32n) + 1n];

    for (const count of counts) {
        if (count === 1n) continue;
        const acceptanceLimit = sampleSpace - (sampleSpace % count);

        if (acceptanceLimit < sampleSpace) {
            const result1 = selectWinningIndex(acceptanceLimit, count);
            assert.ok(result1 >= 0n && result1 < count, `Failed for count ${count} at limit`);
        }

        const result2 = selectWinningIndex(acceptanceLimit - 1n, count);
        assert.ok(result2 >= 0n && result2 < count, `Failed for count ${count} below limit`);

        if (acceptanceLimit + 1n < sampleSpace) {
            const result3 = selectWinningIndex(acceptanceLimit + 1n, count);
            assert.ok(result3 >= 0n && result3 < count, `Failed for count ${count} above limit`);
        }
    }
  });

  it('verifies unique multiple winners constraints over various seeds and counts', () => {
    const eligibleCount = 100n;
    const seeds = [
      parseRandomnessSeed('0x' + '0'.repeat(63) + '0'),
      parseRandomnessSeed('0x' + '0'.repeat(63) + '1'),
      parseRandomnessSeed('0x' + 'f'.repeat(64)),
      parseRandomnessSeed('0x' + 'a'.repeat(64))
    ];

    for (const seed of seeds) {
      const winners = selectUniqueWinningIndices(seed, eligibleCount, 99n, 'draw-fuzz');
      assert.equal(winners.length, 99);
      assert.equal(new Set(winners).size, 99);
      for (const w of winners) {
        assert.ok(w >= 0n && w < eligibleCount);
      }
    }
  });

  it('rejects multi-winner count > MAX_SAFE_INTEGER', () => {
     assert.throws(() => selectUniqueWinningIndices(100n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'draw1'), /winner_count_too_large/);
  });
});
