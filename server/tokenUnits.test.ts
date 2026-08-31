import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateWld } from './tokenUnits.js';

describe('allocateWld', () => {
  it('throws when totalUnits is 0n', () => {
    assert.throws(() => allocateWld(0n), new Error('Purchase total must be positive'));
  });

  it('throws when totalUnits is negative', () => {
    assert.throws(() => allocateWld(-1n), new Error('Purchase total must be positive'));
    assert.throws(() => allocateWld(-100n), new Error('Purchase total must be positive'));
  });

  it('allocates WLD correctly for a valid positive total', () => {
    const result = allocateWld(100n);
    assert.deepEqual(result, {
      monthly: 60n,
      annual: 10n,
      platform: 20n,
      commercial: 10n,
    });
  });

  it('handles remainder by allocating to commercial', () => {
    // For 101n:
    // monthly: 101n * 60n / 100n = 60n
    // annual: 101n * 10n / 100n = 10n
    // platform: 101n * 20n / 100n = 20n
    // commercial: 101n - 60n - 10n - 20n = 11n
    const result = allocateWld(101n);
    assert.deepEqual(result, {
      monthly: 60n,
      annual: 10n,
      platform: 20n,
      commercial: 11n,
    });
  });
});
