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

test('canonical closed beta product and trust loop', async () => {
  const user: InternalUser = { id: `user_${'b'.repeat(64)}`, username: 'Human_BBBBBBBB' };
  const recipient = '0x1111111111111111111111111111111111111111';
  const config = createPaymentConfig({ WORLDPRIZE_ENV: 'development', WORLD_APP_ID: 'app_beta_smoke', WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'true' }); assert(config);
  const economyRepository = new DevelopmentMemoryEconomyRepository();
  const economy = new EconomyService(economyRepository, new DevelopmentPaymentVerifier(config), {
    async sample() { return { basisPoints: 0, reference: 'beta-smoke-scratch-0001', provider: 'beta-smoke-fixture' }; },
  }, config);
  const intent = await economy.createPurchaseIntent(user, { campaignId: ACTIVE_CAMPAIGN.id, tierId: '33333333-3333-4333-8333-333333333333', quantity: 1 });
  const completion = await economy.confirmPurchase(user, intent.reference, 'devtx_22222222-2222-4222-8222-222222222222');
  const title = completion.titles[0]!; await economy.revealScratch(user, title.id);
  const persisted = await economy.snapshot(user); const revealed = persisted.titles[0]!;
  assert.equal(revealed.scratchStatus, 'revealed'); assert.equal(revealed.drawEligible, true); assert.equal(revealed.currentOwnerId, user.id);

  const draws = new DrawService(new DevelopmentMemoryDrawRepository(), new LocalDeterministicDrawRandomnessProvider('test', 'closed-beta-smoke-seed'));
  await draws.createDraw({ id: 'beta-smoke-global', campaignId: ACTIVE_CAMPAIGN.id, eligibilityScope: 'GLOBAL', allowedTierCodes: ['accessible', 'purple', 'gold'], opensAt: '2026-01-01T00:00:00.000Z', closesAt: '2026-01-02T00:00:00.000Z' });
  await draws.openDraw('beta-smoke-global'); await draws.addEligibleTitle('beta-smoke-global', { id: title.id, serial: title.serial, campaignId: title.campaignId, tierCode: title.tierCode, currentOwnerId: title.currentOwnerId, issuedAt: '2026-01-01T12:00:00.000Z', drawEligible: title.drawEligible, lifecycleState: title.lifecycleState, scratchStatus: 'revealed' });
  await draws.closeDraw('beta-smoke-global', '2026-01-02T00:00:00.000Z');
  const artifact = await draws.getPublicArtifact('beta-smoke-global'); assert(artifact);
  const publisher = new LocalMemoryManifestPublisher(); assert.equal((await publisher.publish(artifact)).replayed, false);
  await draws.requestRandomness('beta-smoke-global'); await draws.resolveDraw('beta-smoke-global');
  const fairness = await draws.getFairness('beta-smoke-global'); assert.equal(fairness?.verificationStatus, 'VERIFIED'); assert.equal(fairness?.winningTitle, title.serial);
  const verification = await draws.verifyPublicDraw('beta-smoke-global'); assert.equal(verification?.verified, true); assert.equal(verification?.anchorVerified, false);
  assert(persisted.ledger.some((entry) => entry.classification === 'verified_purchase' && entry.direction === 'debit'));
  assert(persisted.ledger.some((entry) => entry.classification === 'simulated_scratch_prize' && entry.amountUnits > 0n && !entry.spendable));
  assert.equal(revealed.renewalState, title.renewalState); assert.equal(revealed.lifecycleState, title.lifecycleState);
});
