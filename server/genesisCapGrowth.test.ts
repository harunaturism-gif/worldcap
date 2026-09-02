import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InternalUser } from './appSession.js';
import {
  calendarPeriodUtc, computeGrowthCampaignCommitment, computeMonthlyHumanClaimSettlement, createMonthlyHumanClaimEpoch,
  DevelopmentMemoryGenesisCapRepository, transitionGrowthCampaign, transitionMonthlyHumanClaimEpoch, validateGrowthCampaign,
} from './genesisCapGrowth.js';
import type { GrowthCampaign, GrowthQuest, HumanClaimEpoch } from './genesisCapTypes.js';

const userA: InternalUser = { id: `user_${'a'.repeat(64)}`, username: 'Human_AAAAAAAA' };
const userB: InternalUser = { id: `user_${'b'.repeat(64)}`, username: 'Human_BBBBBBBB' };
const userC: InternalUser = { id: `user_${'c'.repeat(64)}`, username: 'Human_CCCCCCCC' };
const septemberOpen = new Date('2026-09-10T12:00:00.000Z');
const octoberClose = new Date('2026-10-01T00:00:01.000Z');

function openEpoch(poolUnits = 101n): HumanClaimEpoch {
  let epoch = createMonthlyHumanClaimEpoch({ id: 'epoch-september', calendarPeriod: '2026-09', poolUnits });
  epoch = transitionMonthlyHumanClaimEpoch(epoch, 'PUBLISHED', new Date('2026-08-31T12:00:00.000Z'));
  return transitionMonthlyHumanClaimEpoch(epoch, 'OPEN', new Date('2026-09-01T00:00:00.000Z'));
}

const growthStart = new Date('2026-09-01T00:00:00.000Z');
function quest(overrides: Partial<GrowthQuest> = {}): GrowthQuest {
  return { id: '11111111-1111-4111-8111-111111111111', campaignId: '22222222-2222-4222-8222-222222222222', code: 'VERIFIED_PROFILE', kind: 'VERIFIED_PROFILE', verificationMode: 'INTERNAL', rewardUnits: 7n, maxRewardedCompletions: null, milestoneThreshold: null, config: {}, status: 'ACTIVE', ...overrides };
}
function activeGrowth(quests: GrowthQuest[], budgetUnits = 100n): GrowthCampaign {
  let campaign: GrowthCampaign = { id: quests[0]!.campaignId, version: 'genesis-v1', name: 'Genesis fixture', startsAt: growthStart.toISOString(), endsAt: '2026-10-01T00:00:00.000Z', status: 'DRAFT', budgetUnits, publishedAt: null, configCommitment: `sha256:${'0'.repeat(64)}`, distributedUnits: 0n, reservedUnits: 0n, accountingMode: 'simulated' };
  campaign = transitionGrowthCampaign(campaign, quests, 'PUBLISHED', new Date('2026-08-31T00:00:00.000Z'));
  return transitionGrowthCampaign(campaign, quests, 'ACTIVE', growthStart);
}

describe('Monthly Human Claim V2', () => {
  it('uses strict UTC YYYY-MM calendar periods', () => {
    assert.equal(calendarPeriodUtc(new Date('2026-09-30T23:59:59.999Z')), '2026-09');
    assert.equal(calendarPeriodUtc(new Date('2026-10-01T00:00:00.000Z')), '2026-10');
    assert.throws(() => createMonthlyHumanClaimEpoch({ id: 'x', calendarPeriod: '2026-13', poolUnits: 1n }), /calendar_period_invalid/);
  });

  it('enforces the complete DRAFT→PUBLISHED→OPEN→CLOSED→FINALIZED order', () => {
    const draft = createMonthlyHumanClaimEpoch({ id: 'x', calendarPeriod: '2026-09', poolUnits: 3n });
    assert.throws(() => transitionMonthlyHumanClaimEpoch(draft, 'OPEN', growthStart), /transition_invalid/);
    const published = transitionMonthlyHumanClaimEpoch(draft, 'PUBLISHED', new Date('2026-08-31T00:00:00Z'));
    const open = transitionMonthlyHumanClaimEpoch(published, 'OPEN', growthStart);
    assert.throws(() => transitionMonthlyHumanClaimEpoch(open, 'FINALIZED', octoberClose), /transition_invalid/);
    const closed = transitionMonthlyHumanClaimEpoch(open, 'CLOSED', octoberClose);
    assert.equal(closed.status, 'CLOSED');
  });

  it('publishes a fixed positive pool before opening', () => {
    assert.throws(() => createMonthlyHumanClaimEpoch({ id: 'x', calendarPeriod: '2026-09', poolUnits: 0n }), /pool_invalid/);
    assert.throws(() => transitionMonthlyHumanClaimEpoch(createMonthlyHumanClaimEpoch({ id: 'x', calendarPeriod: '2026-09', poolUnits: 1n }), 'PUBLISHED', septemberOpen), /publish_after_open/);
  });

  it('registers once without crediting CAP immediately', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()] });
    const first = await repository.registerMonthlyClaim(userA, septemberOpen); const second = await repository.registerMonthlyClaim(userA, septemberOpen);
    assert.equal(first.replayed, false); assert.equal(second.replayed, true); assert.equal(first.participation.settledUnits, 0n);
    assert.equal((await repository.getJourney(userA, septemberOpen)).cap.humanClaimUnits, 0n);
  });

  it('rejects registrations outside an OPEN monthly epoch', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository();
    await assert.rejects(repository.registerMonthlyClaim(userA, septemberOpen), /human_claim_not_open/);
  });

  it('splits integer units equally and leaves the remainder unissued', () => {
    assert.deepEqual(computeMonthlyHumanClaimSettlement(101n, 3n), { unitsPerHuman: 33n, unissuedRemainderUnits: 2n });
    assert.deepEqual(computeMonthlyHumanClaimSettlement(101n, 0n), { unitsPerHuman: 0n, unissuedRemainderUnits: 101n });
  });

  it('finalizes deterministically and idempotently', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()] });
    await repository.registerMonthlyClaim(userB, septemberOpen); await repository.registerMonthlyClaim(userA, septemberOpen); await repository.registerMonthlyClaim(userC, septemberOpen);
    repository.transitionEpoch('epoch-september', 'CLOSED', octoberClose);
    const first = await repository.finalizeMonthlyClaim('epoch-september', octoberClose); const second = await repository.finalizeMonthlyClaim('epoch-september', octoberClose);
    assert.equal(first.epoch.settledUnitsPerHuman, 33n); assert.equal(first.epoch.unissuedRemainderUnits, 2n); assert.equal(first.settlements.length, 3); assert.equal(second.replayed, true); assert.equal(repository.distributions.size, 3);
  });

  it('cannot finalize an open or early epoch', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()] });
    await assert.rejects(repository.finalizeMonthlyClaim('epoch-september', septemberOpen), /not_closed/);
    assert.throws(() => repository.transitionEpoch('epoch-september', 'CLOSED', septemberOpen), /close_early/);
  });

  it('labels open share calculations as ESTIMATE and finalized shares as exact', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()] });
    await repository.registerMonthlyClaim(userA, septemberOpen);
    const open = await repository.getJourney(userA, septemberOpen); assert.equal(open.humanClaim.estimateLabel, 'ESTIMATE'); assert.equal(open.humanClaim.estimatedUnits, 101n);
    repository.transitionEpoch('epoch-september', 'CLOSED', octoberClose); await repository.finalizeMonthlyClaim('epoch-september', octoberClose);
    const finalized = await repository.getJourney(userA, new Date('2026-09-30T23:59:59Z')); assert.equal(finalized.humanClaim.estimateLabel, null); assert.equal(finalized.humanClaim.settledUnits, 101n);
  });

  it('keeps one unique participation per verified-human identity key', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()] });
    await Promise.all([repository.registerMonthlyClaim(userA, septemberOpen), repository.registerMonthlyClaim(userA, septemberOpen)]);
    assert.equal(repository.participations.size, 1);
  });
});

describe('Genesis Growth budget-first quests', () => {
  it('commits deterministically to published campaign and quest configuration', () => {
    const quests = [quest()]; const campaign = activeGrowth(quests);
    assert.equal(campaign.configCommitment, computeGrowthCampaignCommitment(campaign, quests));
    assert.notEqual(campaign.configCommitment, computeGrowthCampaignCommitment(campaign, [{ ...quests[0]!, rewardUnits: 8n }]));
  });

  it('rejects external quest kinds declared as internally verified', () => {
    const quests = [quest({ kind: 'FOLLOW_X', verificationMode: 'INTERNAL' })];
    const campaign: GrowthCampaign = { ...activeGrowth([quest()]), status: 'DRAFT', publishedAt: null, configCommitment: `sha256:${'0'.repeat(64)}` };
    assert.throws(() => validateGrowthCampaign(campaign, quests), /verification_mode_invalid/);
  });

  it('fails external social follow quests closed without an authoritative provider', async () => {
    const q = quest({ kind: 'FOLLOW_INSTAGRAM', code: 'FOLLOW_INSTAGRAM', verificationMode: 'EXTERNAL' }); const campaign = activeGrowth([q]);
    const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    const result = await repository.evaluateQuest(userA, q.id, septemberOpen); assert.equal(result.status, 'UNAVAILABLE'); assert.match(result.reason ?? '', /provider unavailable/);
  });

  it('allows an authoritative provider to qualify an external quest', async () => {
    const q = quest({ kind: 'FOLLOW_X', code: 'FOLLOW_X', verificationMode: 'EXTERNAL' }); const campaign = activeGrowth([q]);
    const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q], externalVerifier: { verify: async () => ({ verified: true, reference: 'provider-proof-1' }) } });
    assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'QUALIFIED');
  });

  it('claims a qualified reward exactly once with an immutable source reference', async () => {
    const q = quest(); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    const first = await repository.claimQuestReward(userA, q.id, septemberOpen); const second = await repository.claimQuestReward(userA, q.id, septemberOpen);
    assert.equal(first.replayed, false); assert.equal(second.replayed, true); assert.equal(first.distribution.source, 'GENESIS_GROWTH'); assert.equal(repository.distributions.size, 1);
  });

  it('serializes concurrent reward claims without double distribution', async () => {
    const q = quest(); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    const results = await Promise.all([repository.claimQuestReward(userA, q.id, septemberOpen), repository.claimQuestReward(userA, q.id, septemberOpen)]);
    assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]); assert.equal(repository.distributions.size, 1); assert.equal(repository.campaigns.get(campaign.id)?.distributedUnits, q.rewardUnits);
  });

  it('never permits distributed plus reserved CAP to exceed the campaign budget', async () => {
    const q = quest({ rewardUnits: 7n }); const campaign = activeGrowth([q], 7n); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    await repository.evaluateQuest(userA, q.id, septemberOpen);
    const denied = await repository.evaluateQuest(userB, q.id, septemberOpen); assert.equal(denied.status, 'UNAVAILABLE'); assert.match(denied.reason ?? '', /budget exhausted/);
  });

  it('enforces configurable quest completion caps without a product hard-code', async () => {
    const q = quest({ maxRewardedCompletions: 1n }); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    await repository.evaluateQuest(userA, q.id, septemberOpen); assert.equal((await repository.evaluateQuest(userB, q.id, septemberOpen)).status, 'UNAVAILABLE');
  });

  it('counts only explicitly verified Title evidence toward configurable milestones', async () => {
    const q = quest({ kind: 'TITLE_COUNT_MILESTONE', code: 'TITLE_COUNT_MILESTONE', milestoneThreshold: 3n }); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    repository.recordVerifiedTitles(userA.id, 2n); assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'IN_PROGRESS');
    repository.recordVerifiedTitles(userA.id, 3n); assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'QUALIFIED');
  });

  it('qualifies first social post only after server persistence', async () => {
    const q = quest({ kind: 'FIRST_SOCIAL_POST', code: 'FIRST_SOCIAL_POST' }); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'LOCKED'); await repository.createSocialPost(userA, 'A persisted post', septemberOpen);
    assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'QUALIFIED');
  });

  it('requires a verified cosmetic purchase record for the bounded rebate quest', async () => {
    const q = quest({ kind: 'FIRST_COSMETIC_PURCHASE_REBATE', code: 'FIRST_COSMETIC_PURCHASE_REBATE' }); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] });
    assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'LOCKED'); repository.recordVerifiedCosmeticPurchase(userA.id); assert.equal((await repository.evaluateQuest(userA, q.id, septemberOpen)).status, 'QUALIFIED');
  });

  it('rejects self-referrals and unverified inviter codes', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository(); const self = await repository.getJourney(userA, septemberOpen);
    await assert.rejects(repository.registerReferral(userA, self.referralCode, septemberOpen), /referral_invalid/);
    await assert.rejects(repository.registerReferral(userB, '0000000000000000', septemberOpen), /referral_invalid/);
  });

  it('records one distinct-human referral before qualification and rejects rebinding', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository(); const inviter = await repository.getJourney(userA, septemberOpen); await repository.getJourney(userB, septemberOpen); await repository.getJourney(userC, septemberOpen);
    const first = await repository.registerReferral(userB, inviter.referralCode, septemberOpen); const retry = await repository.registerReferral(userB, inviter.referralCode, septemberOpen);
    assert.equal(first.replayed, false); assert.equal(retry.replayed, true);
    const other = await repository.getJourney(userC, septemberOpen); await assert.rejects(repository.registerReferral(userB, other.referralCode, septemberOpen), /already_bound/);
  });

  it('rejects referrals recorded after qualification evidence', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository(); const inviter = await repository.getJourney(userA, septemberOpen); await repository.createSocialPost(userB, 'Already qualified', septemberOpen);
    await assert.rejects(repository.registerReferral(userB, inviter.referralCode, septemberOpen), /must_precede/);
  });

  it('qualifies referrals only after the referee is verified', async () => {
    const repository = new DevelopmentMemoryGenesisCapRepository(); const inviter = await repository.getJourney(userA, septemberOpen); await repository.getJourney(userB, septemberOpen); await repository.registerReferral(userB, inviter.referralCode, septemberOpen);
    repository.qualifyReferral(userB.id, septemberOpen); assert.equal([...repository.referrals.values()][0]?.qualifiedAt, septemberOpen.toISOString());
  });

  it('keeps CAP accounting sources explicit and aggregate-safe', async () => {
    const q = quest(); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ campaigns: [campaign], quests: [q] }); await repository.claimQuestReward(userA, q.id, septemberOpen);
    const totals = (await repository.getJourney(userA, septemberOpen)).cap; assert.equal(totals.genesisGrowthUnits, q.rewardUnits); assert.equal(totals.humanClaimUnits, 0n); assert.equal(totals.accountingMode, 'simulated');
  });

  it('exposes only aggregate privacy-safe public fairness data', async () => {
    const q = quest(); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()], campaigns: [campaign], quests: [q] }); await repository.registerMonthlyClaim(userA, septemberOpen); await repository.claimQuestReward(userA, q.id, septemberOpen);
    const summary = await repository.getPublicSummary(septemberOpen); const serialized = JSON.stringify(summary, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    assert.equal(serialized.includes(userA.id), false); assert.equal(serialized.includes('wallet'), false); assert.equal(summary.genesis.distributedUnits, q.rewardUnits);
  });

  it('provides read-only founder exposure metrics without token operations', async () => {
    const q = quest(); const campaign = activeGrowth([q]); const repository = new DevelopmentMemoryGenesisCapRepository({ epochs: [openEpoch()], campaigns: [campaign], quests: [q] }); await repository.registerMonthlyClaim(userA, septemberOpen); await repository.claimQuestReward(userA, q.id, septemberOpen);
    const metrics = await repository.getFounderMetrics(septemberOpen);
    assert.equal(metrics.genesis.remainingUnits, campaign.budgetUnits - q.rewardUnits);
    assert.equal(metrics.trust.productionTokenTransfers, false);
    assert.equal(metrics.humanClaim.projectedShare10x, openEpoch().poolUnits / 10n);
    assert.equal(metrics.product.verifiedHumans, 1n);
    assert.equal(metrics.operations.readinessStatus, 'DEVELOPMENT_MEMORY');
  });
});
