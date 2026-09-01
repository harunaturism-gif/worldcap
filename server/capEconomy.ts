import { createHash } from 'node:crypto';

const CODE_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface CapTierEntitlement {
  tierCode: string;
  entitlementUnits: bigint;
}

export interface CapCampaignMetric {
  campaignId: string;
  version: string;
  tierEntitlements: readonly CapTierEntitlement[];
  humanClaimUnits: bigint;
  humanClaimBudgetUnits: bigint;
  humanClaimPeriodSeconds: number;
}

export interface CapEntitlementCommitmentInput {
  campaignId: string;
  titleId: string;
  metricVersion: string;
  entitlementUnits: bigint;
}

export interface CapLockRequest {
  amountUnits: bigint;
  now: Date;
  unlockAt: Date;
  maxLockSeconds?: number;
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name}_required`);
  return normalized;
}

export function parseCapUnits(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('cap_units_invalid');
  return BigInt(value);
}

export function validateCapCampaignMetric(metric: CapCampaignMetric): CapCampaignMetric {
  requireText(metric.campaignId, 'cap_campaign_id');
  if (!VERSION_PATTERN.test(metric.version)) throw new Error('cap_metric_version_invalid');
  if (!Number.isSafeInteger(metric.humanClaimPeriodSeconds) || metric.humanClaimPeriodSeconds < 3600) {
    throw new Error('cap_claim_period_invalid');
  }
  if (metric.humanClaimUnits < 0n || metric.humanClaimBudgetUnits < 0n) throw new Error('cap_claim_budget_invalid');
  if (metric.humanClaimUnits > metric.humanClaimBudgetUnits && metric.humanClaimBudgetUnits !== 0n) {
    throw new Error('cap_claim_exceeds_epoch_budget');
  }
  if (metric.tierEntitlements.length === 0) throw new Error('cap_tier_entitlements_required');

  const seen = new Set<string>();
  for (const entry of metric.tierEntitlements) {
    if (!CODE_PATTERN.test(entry.tierCode)) throw new Error('cap_tier_code_invalid');
    if (seen.has(entry.tierCode)) throw new Error('cap_tier_duplicate');
    if (entry.entitlementUnits <= 0n) throw new Error('cap_title_entitlement_invalid');
    seen.add(entry.tierCode);
  }

  return Object.freeze({
    ...metric,
    tierEntitlements: Object.freeze(metric.tierEntitlements.map((entry) => Object.freeze({ ...entry }))),
  });
}

export function capEntitlementForTier(metric: CapCampaignMetric, tierCode: string): bigint {
  validateCapCampaignMetric(metric);
  const normalized = tierCode.trim().toLowerCase();
  const entry = metric.tierEntitlements.find((item) => item.tierCode === normalized);
  if (!entry) throw new Error('cap_tier_entitlement_missing');
  return entry.entitlementUnits;
}

export function computeCapEntitlementCommitment(input: CapEntitlementCommitmentInput): `sha256:${string}` {
  const campaignId = requireText(input.campaignId, 'cap_campaign_id');
  const titleId = requireText(input.titleId, 'cap_title_id');
  if (!VERSION_PATTERN.test(input.metricVersion)) throw new Error('cap_metric_version_invalid');
  if (input.entitlementUnits <= 0n) throw new Error('cap_title_entitlement_invalid');

  const canonical = [
    'cap-entitlement-v1',
    campaignId,
    titleId,
    input.metricVersion,
    input.entitlementUnits.toString(),
  ].join('|');

  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

/** @deprecated Historical periodic V1 helper. New claims use YYYY-MM UTC Monthly Human Claim V2. */
export function humanClaimPeriodIndex(startsAt: Date, now: Date, periodSeconds: number): bigint {
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds < 3600) throw new Error('cap_claim_period_invalid');
  const startMs = startsAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || nowMs < startMs) throw new Error('cap_claim_not_started');
  return BigInt(Math.floor((nowMs - startMs) / (periodSeconds * 1000)));
}

export function validateCapLock(request: CapLockRequest): void {
  if (request.amountUnits <= 0n) throw new Error('cap_lock_amount_invalid');
  const nowMs = request.now.getTime();
  const unlockMs = request.unlockAt.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(unlockMs) || unlockMs <= nowMs) throw new Error('cap_lock_time_invalid');
  const maxLockSeconds = request.maxLockSeconds ?? 365 * 24 * 60 * 60;
  if (!Number.isSafeInteger(maxLockSeconds) || maxLockSeconds < 24 * 60 * 60) throw new Error('cap_lock_policy_invalid');
  if (unlockMs - nowMs > maxLockSeconds * 1000) throw new Error('cap_lock_too_long');
}
