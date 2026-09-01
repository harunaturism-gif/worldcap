import assert from 'node:assert/strict';
import test from 'node:test';
import { DevelopmentMemoryEconomyRepository, ACTIVE_CAMPAIGN } from './economyRepository.js';
import { EconomyService } from './economyService.js';
import { DevelopmentPaymentVerifier, createPaymentConfig } from './paymentVerifier.js';
import { DevelopmentMemoryDrawRepository } from './drawRepository.js';
import { DrawService } from './drawService.js';
import { LocalDeterministicDrawRandomnessProvider } from './drawRandomness.js';
import type { InternalUser } from './appSession.js';
import { LocalMemoryManifestPublisher } from './publicManifest.js';
import { createMonthlyHumanClaimEpoch, DevelopmentMemoryGenesisCapRepository, transitionGrowthCampaign, transitionMonthlyHumanClaimEpoch } from './genesisCapGrowth.js';
import type { GrowthCampaign, GrowthQuest } from './genesisCapTypes.js';

test('canonical closed beta product and trust loop', async () => {
  const user: InternalUser = { id: `user_${'b'.repeat(64)}`, username: 'Human_BBBBBBBB' };
  const recipient = '0x1111111111111111111111111111111111111111';
  const config = createPaymentConfig({ WORLDPRIZE_ENV: 'development', WORLD_APP_ID: 'app_beta_smoke', WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'true' }); assert(config);
  const economyRepository = new DevelopmentMemoryEconomyRepository();
  const economy = new EconomyService(economyRepository, new DevelopmentPaymentVerifier(config), {
    async sample() { return { basisPoints: 0, reference: 'beta-smoke-scratch-0001', provider: 'beta-smoke-fixture' }; },
  }, config);
  const intent = await economy.createPurchaseIntent(user, { campaignId: ACTIVE_CAMPAIGN.id, tierId: '33333333-3333-4333-8333-333333333333', quantity: 5 });
  const completion = await economy.confirmPurchase(user, intent.reference, 'devtx_22222222-2222-4222-8222-222222222222');
  const titles = completion.titles; const title = titles[0]!;
  const persisted = await economy.snapshot(user);
  assert.equal(persisted.titles.length, 5); assert(titles.every((entry) => entry.drawEligible && entry.currentOwnerId === user.id));

  let epoch = createMonthlyHumanClaimEpoch({ id: 'beta-human-september', calendarPeriod: '2026-09', poolUnits: 101n });
  epoch = transitionMonthlyHumanClaimEpoch(epoch, 'PUBLISHED', new Date('2026-08-31T00:00:00Z')); epoch = transitionMonthlyHumanClaimEpoch(epoch, 'OPEN', new Date('2026-09-01T00:00:00Z'));
  const quest: GrowthQuest = { id: '11111111-1111-4111-8111-111111111111', campaignId: '22222222-2222-4222-8222-222222222222', code: 'VERIFIED_PROFILE', kind: 'VERIFIED_PROFILE', verificationMode: 'INTERNAL', rewardUnits: 7n, maxRewardedCompletions: null, milestoneThreshold: null, config: {}, status: 'ACTIVE' };
  let growth: GrowthCampaign = { id: quest.campaignId, version: 'beta-v1', name: 'Beta Genesis', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z', status: 'DRAFT', budgetUnits: 100n, publishedAt: null, configCommitment: `sha256:${'0'.repeat(64)}`, distributedUnits: 0n, reservedUnits: 0n, accountingMode: 'simulated' };
  growth = transitionGrowthCampaign(growth, [quest], 'PUBLISHED', new Date('2026-08-31T00:00:00Z')); growth = transitionGrowthCampaign(growth, [quest], 'ACTIVE', new Date('2026-09-01T00:00:00Z'));
  const genesis = new DevelopmentMemoryGenesisCapRepository({ epochs: [epoch], campaigns: [growth], quests: [quest] });
  await genesis.registerMonthlyClaim(user, new Date('2026-09-15T00:00:00Z')); await genesis.claimQuestReward(user, quest.id, new Date('2026-09-15T00:00:00Z'));
  genesis.transitionEpoch(epoch.id, 'CLOSED', new Date('2026-10-01T00:00:01Z')); await genesis.finalizeMonthlyClaim(epoch.id, new Date('2026-10-01T00:00:01Z'));
  const capJourney = await genesis.getJourney(user, new Date('2026-09-30T23:59:59Z')); assert.equal(capJourney.humanClaim.settledUnits, 101n); assert.equal(capJourney.cap.genesisGrowthUnits, 7n);

  const draws = new DrawService(new DevelopmentMemoryDrawRepository(), new LocalDeterministicDrawRandomnessProvider('test', 'closed-beta-smoke-seed'));
  await draws.createDraw({ id: 'beta-smoke-global', campaignId: ACTIVE_CAMPAIGN.id, kind: 'MONTHLY', prizePoolUnits: 38n, eligibilityScope: 'GLOBAL', allowedTierCodes: ['accessible', 'purple', 'gold'], opensAt: '2026-01-01T00:00:00.000Z', closesAt: '2026-01-02T00:00:00.000Z' });
  await draws.openDraw('beta-smoke-global'); for (const entry of titles) await draws.addEligibleTitle('beta-smoke-global', { id: entry.id, serial: entry.serial, campaignId: entry.campaignId, tierCode: entry.tierCode, currentOwnerId: entry.currentOwnerId, issuedAt: '2026-01-01T12:00:00.000Z', drawEligible: entry.drawEligible, lifecycleState: entry.lifecycleState, scratchStatus: entry.scratchStatus });
  await draws.closeDraw('beta-smoke-global', '2026-01-02T00:00:00.000Z');
  const artifact = await draws.getPublicArtifact('beta-smoke-global'); assert(artifact);
  const publisher = new LocalMemoryManifestPublisher(); assert.equal((await publisher.publish(artifact)).replayed, false);
  await draws.requestRandomness('beta-smoke-global'); await draws.resolveDraw('beta-smoke-global');
  const fairness = await draws.getFairness('beta-smoke-global'); assert.equal(fairness?.verificationStatus, 'VERIFIED'); assert.equal(fairness?.winners.length, 5); assert.equal(new Set(fairness?.winners.map((winner) => winner.winningTitle)).size, 5);
  const verification = await draws.verifyPublicDraw('beta-smoke-global'); assert.equal(verification?.verified, true); assert.equal(verification?.anchorVerified, false);
  assert(persisted.ledger.some((entry) => entry.classification === 'verified_purchase' && entry.direction === 'debit'));
  for (const entry of titles) economyRepository.titles.set(entry.id, { ...entry, capRedemptionState: 'available' });
  const capClaim = await economy.claimTitleCap(user, title.id); assert.equal(capClaim.drawEligible, true); assert.equal(economyRepository.titles.get(title.id)?.capRedemptionState, 'claimed');
  assert.equal(economyRepository.titles.get(title.id)?.renewalState, title.renewalState); assert.equal(economyRepository.titles.get(title.id)?.lifecycleState, title.lifecycleState);
});
