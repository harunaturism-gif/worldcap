import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateWld } from './tokenUnits.js';
import { assertGrossAllocation, assertSimulatedWinningsNonSpendable } from './protocolInvariants.js';
import { claimCapRedemption, makeCapRedemptionAvailable, resolveOrderedWinners, splitMonthlyPrizePool } from './economicsV1.js';
import { DevelopmentMemoryDrawRepository } from './drawRepository.js';
import { LocalDeterministicDrawRandomnessProvider } from './drawRandomness.js';
import { DrawService } from './drawService.js';
import type { DrawEligibilityCandidate } from './drawTypes.js';
import { createPublicDrawArtifact } from './publicManifest.js';
import { verifyDrawV2 } from './verifyDrawV2.js';

const campaignId = 'economics-campaign';
const monthlyTitle = (index: number): DrawEligibilityCandidate => ({
  id: `monthly-title-${index}`, serial: `PURPLE-SEP26-${String(index).padStart(6, '0')}`,
  campaignId, tierCode: 'purple', currentOwnerId: `private-${index}`,
  issuedAt: '2026-09-01T00:00:00.000Z', drawEligible: true,
  lifecycleState: 'active', scratchStatus: 'available',
});

async function resolvedMonthlyDraw() {
  const repository = new DevelopmentMemoryDrawRepository();
  const service = new DrawService(repository, new LocalDeterministicDrawRandomnessProvider('test', 'economics-five-winner-seed'));
  await service.createDraw({ id: 'monthly-economics-draw', kind: 'MONTHLY', prizePoolUnits: 101n, campaignId, eligibilityScope: 'PURPLE', allowedTierCodes: ['purple'], opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-09-30T20:00:00.000Z' });
  await service.openDraw('monthly-economics-draw');
  for (let index = 1; index <= 8; index += 1) await service.addEligibleTitle('monthly-economics-draw', monthlyTitle(index));
  const manifest = await service.closeDraw('monthly-economics-draw', '2026-09-30T20:00:01.000Z');
  await service.requestRandomness('monthly-economics-draw');
  const draw = await service.resolveDraw('monthly-economics-draw');
  return { repository, service, manifest, draw };
}

describe('WorldCAP economics v1', () => {
  it('allocates every title sale exactly 40/38/10/10/2', () => {
    const parts = allocateWld(101n);
    assert.deepEqual(parts, { capRedemption: 40n, monthly: 38n, quarterly: 10n, company: 10n, platform: 3n });
    assertGrossAllocation(101n, [
      { bucket: 'cap_redemption_program', percentage: 40, amountUnits: parts.capRedemption },
      { bucket: 'monthly_prize_pool', percentage: 38, amountUnits: parts.monthly },
      { bucket: 'quarterly_jackpot', percentage: 10, amountUnits: parts.quarterly },
      { bucket: 'company_treasury', percentage: 10, amountUnits: parts.company },
      { bucket: 'platform_operations', percentage: 2, amountUnits: parts.platform },
    ]);
  });

  it('uses the five published allocation buckets with no legacy annual bucket for new sales', () => {
    const parts = allocateWld(10_000n);
    const buckets = new Map([
      ['cap_redemption_program', parts.capRedemption], ['monthly_prize_pool', parts.monthly],
      ['quarterly_jackpot', parts.quarterly], ['company_treasury', parts.company], ['platform_operations', parts.platform],
    ]);
    assert.deepEqual([...buckets.keys()], ['cap_redemption_program', 'monthly_prize_pool', 'quarterly_jackpot', 'company_treasury', 'platform_operations']);
    assert.equal(buckets.has('annual_jackpot'), false);
  });

  it('preserves gross allocation for the smallest indivisible base unit', () => {
    const parts = allocateWld(1n);
    assert.equal(Object.values(parts).reduce((sum, amount) => sum + amount, 0n), 1n);
    assert.equal(parts.platform, 1n);
  });

  it('forbids a simulated draw liability from becoming spendable WLD', () => {
    assert.throws(() => assertSimulatedWinningsNonSpendable({ classification: 'simulated_draw_prize', spendable: true }), /simulated_winnings_cannot_be_spendable/);
    assert.doesNotThrow(() => assertSimulatedWinningsNonSpendable({ classification: 'simulated_draw_prize', spendable: false }));
  });

  it('splits the monthly pool exactly 55/25/10/6/4 including integer remainder', () => {
    const payouts = splitMonthlyPrizePool(101n);
    assert.deepEqual(payouts, [55n, 25n, 10n, 6n, 5n]);
    assert.equal(payouts.reduce((sum, amount) => sum + amount, 0n), 101n);
  });

  it('matches the published 38 WLD monthly payout example in base units', () => {
    const oneWld = 1_000_000_000_000_000_000n;
    assert.deepEqual(splitMonthlyPrizePool(38n * oneWld), [20_900_000_000_000_000_000n, 9_500_000_000_000_000_000n, 3_800_000_000_000_000_000n, 2_280_000_000_000_000_000n, 1_520_000_000_000_000_000n]);
  });

  it('selects five deterministic ordered winners without replacement', () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({ titleId: `title-${index}` }));
    const first = resolveOrderedWinners({ drawId: 'monthly-1', drawKind: 'MONTHLY', randomnessSeed: 42n, entries, prizePoolUnits: 10_000n });
    const second = resolveOrderedWinners({ drawId: 'monthly-1', drawKind: 'MONTHLY', randomnessSeed: 42n, entries, prizePoolUnits: 10_000n });
    assert.deepEqual(first, second);
    assert.deepEqual(first.map((winner) => winner.ordinal), [1, 2, 3, 4, 5]);
    assert.deepEqual(first.map((winner) => winner.payoutBasisPoints), [5_500, 2_500, 1_000, 600, 400]);
    assert.equal(new Set(first.map((winner) => winner.titleId)).size, 5);
  });

  it('fails a monthly draw closed when fewer than five titles are eligible', () => {
    assert.throws(() => resolveOrderedWinners({ drawId: 'monthly-small', drawKind: 'MONTHLY', randomnessSeed: 1n, entries: [{ titleId: 'only' }], prizePoolUnits: 10n }), /monthly_draw_requires_five_eligible_titles/);
  });

  it('keeps the quarterly jackpot a separate deterministic single-winner result', () => {
    const winners = resolveOrderedWinners({ drawId: 'quarterly-1', drawKind: 'QUARTERLY', randomnessSeed: 99n, entries: Array.from({ length: 10 }, (_, index) => ({ titleId: `q-${index}` })), prizePoolUnits: 777n });
    assert.equal(winners.length, 1);
    assert.equal(winners[0]?.payoutBasisPoints, 10_000);
    assert.equal(winners[0]?.payoutUnits, 777n);
  });

  it('only unlocks CAP after monthly resolution and preserves quarterly eligibility after claim', () => {
    const locked = { capRedemptionState: 'locked' as const, capEntitlementUnits: 400n, drawEligible: true };
    assert.equal(makeCapRedemptionAvailable(locked, 'QUARTERLY').capRedemptionState, 'locked');
    const available = makeCapRedemptionAvailable(locked, 'MONTHLY');
    assert.equal(available.capRedemptionState, 'available');
    const claim = claimCapRedemption(available);
    assert.equal(claim.title.capRedemptionState, 'claimed');
    assert.equal(claim.title.drawEligible, true);
    assert.equal(claimCapRedemption(claim.title).replayed, true);
  });

  it('rejects CAP claims before monthly availability', () => {
    assert.throws(() => claimCapRedemption({ capRedemptionState: 'locked', capEntitlementUnits: 400n, drawEligible: true }), /cap_redemption_not_available/);
  });

  it('rejects an explicitly expired CAP entitlement', () => {
    assert.throws(() => claimCapRedemption({ capRedemptionState: 'expired', capEntitlementUnits: 400n, drawEligible: true }), /cap_redemption_expired/);
  });

  it('resolves exactly five persisted monthly winners and no sixth winner', async () => {
    const { draw } = await resolvedMonthlyDraw();
    assert.equal(draw.winners.length, 5);
    assert.equal(draw.winners[5], undefined);
    assert.equal(new Set(draw.winners.map((winner) => winner.winningTitleId)).size, 5);
    assert.deepEqual(draw.winners.map((winner) => winner.payoutUnits), [55n, 25n, 10n, 6n, 5n]);
  });

  it('Verify Draw V2 reproduces the ordered winner set and rejects order or payout substitution', async () => {
    const { draw, manifest } = await resolvedMonthlyDraw();
    const artifact = createPublicDrawArtifact(draw, manifest);
    const randomness = { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true };
    const valid = verifyDrawV2({ draw, artifact, randomness });
    assert.equal(valid.verified, true);
    assert.equal(valid.winners.length, 5);
    const reversed = { ...draw, winners: [...draw.winners].reverse() };
    assert.equal(verifyDrawV2({ draw: reversed, artifact, randomness }).winnerVerified, false);
    const substituted = { ...draw, winners: draw.winners.map((winner, index) => index === 0 ? { ...winner, payoutBasisPoints: 5_499 } : winner) };
    assert.equal(verifyDrawV2({ draw: substituted, artifact, randomness }).winnerVerified, false);
  });

  it('binds the public artifact hash to monthly kind and prize-pool amount', async () => {
    const { draw, manifest } = await resolvedMonthlyDraw();
    const artifact = createPublicDrawArtifact(draw, manifest);
    const randomness = { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true };
    assert.equal(verifyDrawV2({ draw, artifact: { ...artifact, drawKind: 'QUARTERLY' }, randomness }).manifestVerified, false);
    assert.equal(verifyDrawV2({ draw, artifact: { ...artifact, prizePoolUnits: '102' }, randomness }).manifestVerified, false);
  });

  it('rejects a substituted title in any ordered winner position', async () => {
    const { draw, manifest } = await resolvedMonthlyDraw();
    const artifact = createPublicDrawArtifact(draw, manifest);
    const randomness = { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true };
    const substituted = { ...draw, winners: draw.winners.map((winner, index) => index === 4 ? { ...winner, winningTitleId: 'administrator-substitution' } : winner) };
    assert.equal(verifyDrawV2({ draw: substituted, artifact, randomness }).winnerVerified, false);
  });

  it('fails the service-level monthly resolution before persisting any winner when fewer than five are eligible', async () => {
    const repository = new DevelopmentMemoryDrawRepository();
    const service = new DrawService(repository, new LocalDeterministicDrawRandomnessProvider('test', 'economics-small-draw-seed'));
    await service.createDraw({ id: 'monthly-too-small', kind: 'MONTHLY', campaignId, eligibilityScope: 'PURPLE', allowedTierCodes: ['purple'], opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-09-30T20:00:00.000Z' });
    await service.openDraw('monthly-too-small');
    for (let index = 1; index <= 4; index += 1) await service.addEligibleTitle('monthly-too-small', monthlyTitle(index));
    await service.closeDraw('monthly-too-small', '2026-09-30T20:00:01.000Z');
    await service.requestRandomness('monthly-too-small');
    await assert.rejects(service.resolveDraw('monthly-too-small'), /monthly_draw_requires_five_eligible_titles/);
    assert.equal((await repository.get('monthly-too-small'))?.winners.length, 0);
  });
});
