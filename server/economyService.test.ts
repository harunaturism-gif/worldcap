import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { InternalUser } from './appSession.js';
import { signApplicationSession, serializeSessionCookie, type AppSessionConfig } from './appSession.js';
import { createEconomyRouter } from './economyRoutes.js';
import { DevelopmentMemoryEconomyRepository } from './economyRepository.js';
import { EconomyService } from './economyService.js';
import { ACCESSIBLE_TIER_ID, ACTIVE_CAMPAIGN_ID, ECONOMIC_MODEL_VERSION, GOLD_TIER_ID, TITLE_PRICE_UNITS, type PurchaseIntentRecord, type VerifiedPayment } from './economyTypes.js';
import type { PaymentConfig, PaymentVerifier } from './paymentVerifier.js';
import type { RandomnessProvider } from './randomness.js';

const recipient = '0x000000000000000000000000000000000000dEaD';
const paymentConfig: PaymentConfig = { runtime: 'development', appId: 'app_worldprize_test', recipient: recipient.toLowerCase(), fakePaymentsEnabled: true };
const userA: InternalUser = { id: `user_${'a'.repeat(64)}`, username: 'Human_AAAAAAAA' };
const userB: InternalUser = { id: `user_${'b'.repeat(64)}`, username: 'Human_BBBBBBBB' };

function payment(intent: PurchaseIntentRecord, transactionId: string, overrides: Partial<VerifiedPayment> = {}): VerifiedPayment {
  return { transactionId, transactionHash: `0x${'c'.repeat(64)}`, reference: intent.reference, transactionStatus: 'mined', from: '0xDeaD00000000000000000000000000000000BEEF', chain: 'worldchain', tokenAmount: intent.totalUnits.toString(), token: 'WLD', to: intent.recipient, appId: paymentConfig.appId, timestamp: new Date().toISOString(), ...overrides };
}

class FixtureVerifier implements PaymentVerifier {
  overrides: Partial<VerifiedPayment> = {};
  async verify(transactionId: string, intent: PurchaseIntentRecord) { return payment(intent, transactionId, this.overrides); }
}

class FixtureRandomness implements RandomnessProvider {
  calls = 0;
  constructor(private readonly basisPoints = 500) {}
  async sample() { this.calls += 1; return { basisPoints: this.basisPoints, reference: `fixture_${this.calls}`, provider: 'fixture-randomness' }; }
}

function fixture(randomBasisPoints = 500) {
  const repository = new DevelopmentMemoryEconomyRepository();
  const verifier = new FixtureVerifier();
  const randomness = new FixtureRandomness(randomBasisPoints);
  const service = new EconomyService(repository, verifier, randomness, paymentConfig);
  return { repository, verifier, randomness, service };
}

async function buy(service: EconomyService, user: InternalUser, quantity: number, transactionId = `tx_${crypto.randomUUID()}`) {
  const intent = await service.createPurchaseIntent(user, { campaignId: ACTIVE_CAMPAIGN_ID, quantity });
  return service.confirmPurchase(user, intent.reference, transactionId);
}

describe('economic vertical slice', () => {
  it('completes a successful verified purchase', async () => {
    const { service } = fixture(); const result = await buy(service, userA, 1);
    assert.equal(result.purchase.totalUnits, TITLE_PRICE_UNITS); assert.equal(result.replayed, false);
  });

  it('issues exactly the requested quantity of unique titles', async () => {
    const { service } = fixture(); const result = await buy(service, userA, 5);
    assert.equal(result.titles.length, 5); assert.equal(new Set(result.titles.map((title) => title.id)).size, 5); assert.equal(new Set(result.titles.map((title) => title.serial)).size, 5);
  });

  it('uses campaign tier configuration for fractional and premium prices', async () => {
    const { service } = fixture();
    const accessibleIntent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, tierId: ACCESSIBLE_TIER_ID, quantity: 2 });
    assert.equal(accessibleIntent.tokenAmount, '1000000000000000000');
    const accessible = await service.confirmPurchase(userA, accessibleIntent.reference, 'tx_accessible_001');
    assert.equal(accessible.titles[0]?.tierCode, 'accessible');
    const goldIntent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, tierId: GOLD_TIER_ID, quantity: 1 });
    assert.equal(goldIntent.tokenAmount, '20000000000000000000');
  });

  it('rejects a tier outside the active campaign configuration', async () => {
    const { service } = fixture();
    await assert.rejects(service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, tierId: crypto.randomUUID(), quantity: 1 }), /title_tier_not_found/);
  });

  it('records original buyer, current owner, lifecycle, renewal, and immutable issuance provenance independently', async () => {
    const { service, repository } = fixture(); const complete = await buy(service, userA, 1); const title = complete.titles[0]!;
    assert.equal(title.originalBuyerId, userA.id); assert.equal(title.currentOwnerId, userA.id);
    assert.equal(title.lifecycleState, 'active'); assert.equal(title.renewalState, 'not_eligible'); assert.equal(title.drawEligible, true);
    assert.deepEqual(repository.ownershipEvents.map((event) => [event.titleId, event.eventType, event.toUserId]), [[title.id, 'issued', userA.id]]);
  });

  it('rejects a wrong payment amount', async () => {
    const { service, verifier } = fixture(); verifier.overrides = { tokenAmount: (TITLE_PRICE_UNITS - 1n).toString() };
    const intent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, quantity: 1 });
    await assert.rejects(service.confirmPurchase(userA, intent.reference, 'tx_wrong_amount'), /payment_wrong_amount/);
  });

  it('rejects a wrong recipient', async () => {
    const { service, verifier } = fixture(); verifier.overrides = { to: '0x0000000000000000000000000000000000000001' };
    const intent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, quantity: 1 });
    await assert.rejects(service.confirmPurchase(userA, intent.reference, 'tx_wrong_recipient'), /payment_wrong_recipient/);
  });

  it('rejects one transaction reused for another intent', async () => {
    const { service } = fixture(); await buy(service, userA, 1, 'tx_duplicate_0001');
    await assert.rejects(buy(service, userA, 1, 'tx_duplicate_0001'), /payment_transaction_consumed/);
  });

  it('rejects one completed reference paired with a different transaction', async () => {
    const { service } = fixture(); const intent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, quantity: 1 });
    await service.confirmPurchase(userA, intent.reference, 'tx_reference_0001');
    await assert.rejects(service.confirmPurchase(userA, intent.reference, 'tx_reference_0002'), /purchase_reference_consumed/);
  });

  it('makes concurrent confirmation idempotent without double issuance', async () => {
    const { service, repository } = fixture(); const intent = await service.createPurchaseIntent(userA, { campaignId: ACTIVE_CAMPAIGN_ID, quantity: 3 });
    const results = await Promise.all([service.confirmPurchase(userA, intent.reference, 'tx_concurrent_001'), service.confirmPurchase(userA, intent.reference, 'tx_concurrent_001')]);
    assert.deepEqual(results.map((item) => item.replayed).sort(), [false, true]); assert.equal(repository.purchases.size, 1); assert.equal(repository.titles.size, 3);
  });

  it('allocates every integer unit exactly across 40/38/10/10/2', async () => {
    const { service, repository } = fixture(); const complete = await buy(service, userA, 3);
    const rows = repository.allocations.filter((row) => row.purchaseId === complete.purchase.id);
    assert.deepEqual(rows.map((row) => row.percentage), [40, 38, 10, 10, 2]); assert.equal(rows.reduce((sum, row) => sum + row.amountUnits, 0n), complete.purchase.totalUnits);
    assert.equal(complete.purchase.economicModelVersion, ECONOMIC_MODEL_VERSION);
  });

  it('derives pool values from persisted allocation rows', async () => {
    const { service } = fixture(); await buy(service, userA, 2); const snapshot = await service.snapshot(userA);
    assert.equal(snapshot.pools.monthly_prize_pool, TITLE_PRICE_UNITS * 2n * 38n / 100n); assert.equal(snapshot.pools.quarterly_jackpot, TITLE_PRICE_UNITS * 2n * 10n / 100n);
  });

  it('rejects unauthenticated economy requests', async () => {
    const { service } = fixture(); const sessionConfig: AppSessionConfig = { appOrigin: 'http://127.0.0.1:5173', identitySecret: 'identity-secret-with-enough-entropy-1234', isProduction: false, sessionSecret: 'session-secret-with-enough-entropy-56789' };
    const app = express(); app.use('/api/economy', createEconomyRouter(service, sessionConfig));
    const server = await new Promise<Server>((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    after(() => server.close());
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/economy/snapshot`);
    assert.equal(response.status, 401);
  });

  it('never exposes another user private ownership', async () => {
    const { service } = fixture(); const complete = await buy(service, userA, 1); const other = await service.snapshot(userB);
    assert.equal(other.titles.length, 0); assert.equal(other.purchases.length, 0); assert.equal(other.ledger.length, 0);
    await assert.rejects(service.revealScratch(userB, complete.titles[0]!.id), /title_not_found/);
  });

  it('persists a scratch result against the title', async () => {
    const { service } = fixture(500); const complete = await buy(service, userA, 1); const scratched = await service.revealScratch(userA, complete.titles[0]!.id); const snapshot = await service.snapshot(userA);
    assert.equal(scratched.title.scratchStatus, 'revealed'); assert.equal(snapshot.scratchResults[0]?.id, scratched.result.id);
  });

  it('returns the original scratch result on retry instead of rerolling', async () => {
    const { service } = fixture(0); const complete = await buy(service, userA, 1); const first = await service.revealScratch(userA, complete.titles[0]!.id); const second = await service.revealScratch(userA, complete.titles[0]!.id);
    assert.equal(second.replayed, true); assert.deepEqual(second.result, first.result);
  });

  it('cannot create a second scratch record for the same title', async () => {
    const { service, repository } = fixture(0); const complete = await buy(service, userA, 1); await Promise.all([service.revealScratch(userA, complete.titles[0]!.id), service.revealScratch(userA, complete.titles[0]!.id)]);
    assert.equal(repository.scratchResults.size, 1);
  });

  it('keeps a scratched title draw eligible', async () => {
    const { service } = fixture(); const complete = await buy(service, userA, 1); const scratched = await service.revealScratch(userA, complete.titles[0]!.id);
    assert.equal(scratched.title.drawEligible, true);
  });

  it('does not convert simulated winnings into real or spendable WLD', async () => {
    const { service } = fixture(0); const complete = await buy(service, userA, 1); await service.revealScratch(userA, complete.titles[0]!.id); const snapshot = await service.snapshot(userA);
    const prize = snapshot.ledger.find((entry) => entry.classification === 'simulated_scratch_prize');
    assert.equal(prize?.spendable, false); assert.equal(snapshot.ledger.filter((entry) => entry.classification === 'verified_purchase').reduce((sum, entry) => sum + entry.amountUnits, 0n), TITLE_PRICE_UNITS);
  });

  it('keeps Title CAP locked before the relevant monthly draw resolves', async () => {
    const { service } = fixture(); const complete = await buy(service, userA, 1);
    assert.equal(complete.titles[0]?.capRedemptionState, 'locked');
    await assert.rejects(service.claimTitleCap(userA, complete.titles[0]!.id), /cap_redemption_not_available/);
  });

  it('claims available CAP idempotently without changing quarterly eligibility', async () => {
    const { service, repository } = fixture(); const complete = await buy(service, userA, 1); const title = complete.titles[0]!;
    repository.titles.set(title.id, { ...title, capRedemptionState: 'available' });
    const first = await service.claimTitleCap(userA, title.id);
    const second = await service.claimTitleCap(userA, title.id);
    assert.equal(first.replayed, false); assert.equal(second.replayed, true);
    assert.equal(first.claimedUnits, title.capEntitlementUnits);
    assert.equal(repository.titles.get(title.id)?.drawEligible, true);
    assert.equal(repository.titles.get(title.id)?.capRedemptionState, 'claimed');
  });

  it('accepts a valid authenticated request without leaking token details', async () => {
    const { service } = fixture(); const sessionConfig: AppSessionConfig = { appOrigin: 'http://127.0.0.1:5173', identitySecret: 'identity-secret-with-enough-entropy-1234', isProduction: false, sessionSecret: 'session-secret-with-enough-entropy-56789' };
    const app = express(); app.use('/api/economy', createEconomyRouter(service, sessionConfig));
    const server = await new Promise<Server>((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    after(() => server.close());
    const cookie = serializeSessionCookie(signApplicationSession(userA, sessionConfig.sessionSecret), false).split(';')[0]!;
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/economy/snapshot`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); assert.equal((await response.text()).includes(sessionConfig.sessionSecret), false);
  });
});
