import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capEntitlementForTier,
  computeCapEntitlementCommitment,
  humanClaimPeriodIndex,
  parseCapUnits,
  validateCapCampaignMetric,
  validateCapLock,
} from './capEconomy.js';

const metric = {
  campaignId: '11111111-1111-4111-8111-111111111111',
  version: 'cap-sep-2026-v1',
  tierEntitlements: [
    { tierCode: 'accessible', entitlementUnits: 120n },
    { tierCode: 'purple', entitlementUnits: 400n },
    { tierCode: 'gold', entitlementUnits: 900n },
  ],
  humanClaimUnits: 5n,
  humanClaimBudgetUnits: 500_000_000n,
  humanClaimPeriodSeconds: 86_400,
} as const;

describe('CAP economy domain', () => {
  it('uses campaign metrics rather than WLD/CAP spot conversion', () => {
    const validated = validateCapCampaignMetric(metric);
    assert.equal(capEntitlementForTier(validated, 'purple'), 400n);
    assert.equal(capEntitlementForTier(validated, 'gold'), 900n);
  });

  it('creates a deterministic immutable entitlement commitment', () => {
    const first = computeCapEntitlementCommitment({
      campaignId: metric.campaignId,
      titleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metricVersion: metric.version,
      entitlementUnits: 400n,
    });
    const second = computeCapEntitlementCommitment({
      campaignId: metric.campaignId,
      titleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metricVersion: metric.version,
      entitlementUnits: 400n,
    });
    const changed = computeCapEntitlementCommitment({
      campaignId: metric.campaignId,
      titleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metricVersion: metric.version,
      entitlementUnits: 401n,
    });
    assert.equal(first, second);
    assert.notEqual(first, changed);
    assert.equal(first, 'sha256:f08dfe0f12a277a3d51f46b3ec967eeaeb96c1a41c4cf56809d97c894a8b096b');
    assert.match(first, /^sha256:[0-9a-f]{64}$/);
  });

  it('computes one deterministic Human Claim period', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    assert.equal(humanClaimPeriodIndex(start, new Date('2026-09-01T23:59:59.000Z'), 86_400), 0n);
    assert.equal(humanClaimPeriodIndex(start, new Date('2026-09-02T00:00:00.000Z'), 86_400), 1n);
  });

  it('rejects invalid integer units and invalid metrics', () => {
    assert.equal(parseCapUnits('1000000000000000000'), 1_000_000_000_000_000_000n);
    assert.throws(() => parseCapUnits('1.5'), /cap_units_invalid/);
    assert.throws(() => validateCapCampaignMetric({ ...metric, tierEntitlements: [] }), /cap_tier_entitlements_required/);
    assert.throws(() => validateCapCampaignMetric({
      ...metric,
      tierEntitlements: [
        { tierCode: 'purple', entitlementUnits: 10n },
        { tierCode: 'purple', entitlementUnits: 20n },
      ],
    }), /cap_tier_duplicate/);
  });

  it('keeps CAP lock voluntary and time-bounded without yield math', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    validateCapLock({ amountUnits: 1_000n, now, unlockAt: new Date('2026-12-01T00:00:00.000Z') });
    assert.throws(() => validateCapLock({ amountUnits: 0n, now, unlockAt: new Date('2026-12-01T00:00:00.000Z') }), /cap_lock_amount_invalid/);
    assert.throws(() => validateCapLock({ amountUnits: 1n, now, unlockAt: now }), /cap_lock_time_invalid/);
  });
});
