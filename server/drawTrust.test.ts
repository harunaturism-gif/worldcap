import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildDrawManifest, computeManifestCommitment } from './drawManifest.js';
import { LocalDeterministicDrawRandomnessProvider, type DrawRandomnessProvider } from './drawRandomness.js';
import { DevelopmentMemoryDrawRepository } from './drawRepository.js';
import { createDrawFairnessRouter } from './drawRoutes.js';
import { DrawService, isEligibleForDraw } from './drawService.js';
import { selectUniqueWinningIndices, selectWinningIndex } from './drawSelection.js';
import type { DrawEligibilityCandidate, DrawEligibilityScope, DrawManifest } from './drawTypes.js';
import { createRenewalLiability, createScratchBatch, createVault, totalPrizeFunding } from './trustFinance.js';
import { verifyDraw } from './verifyDraw.js';

const campaignId = 'campaign-september-2026';
const opensAt = '2026-09-01T00:00:00.000Z';
const closesAt = '2026-09-30T20:00:00.000Z';
const finalizedAt = '2026-09-30T20:00:01.000Z';

function title(index: number, tier: DrawEligibilityCandidate['tierCode'] = 'purple', overrides: Partial<DrawEligibilityCandidate> = {}): DrawEligibilityCandidate {
  return {
    id: `title-${index}`, serial: `${tier.toUpperCase()}-SEP26-${String(index).padStart(6, '0')}`,
    campaignId, tierCode: tier, currentOwnerId: `private-user-${index}`, issuedAt: '2026-09-15T00:00:00.000Z',
    drawEligible: true, lifecycleState: 'active', scratchStatus: 'available', ...overrides,
  };
}

async function fixture(scope: DrawEligibilityScope = 'GLOBAL', allowedTierCodes: readonly string[] = ['accessible', 'purple', 'gold']) {
  const repository = new DevelopmentMemoryDrawRepository();
  const provider = new LocalDeterministicDrawRandomnessProvider('test', 'repeatable-test-seed-v1');
  const service = new DrawService(repository, provider);
  const draw = await service.createDraw({ id: `draw-${scope.toLowerCase()}`, campaignId, eligibilityScope: scope, allowedTierCodes, opensAt, closesAt });
  await service.openDraw(draw.id);
  return { repository, service, drawId: draw.id };
}

async function resolvedFixture() {
  const context = await fixture();
  await context.service.addEligibleTitle(context.drawId, title(2));
  await context.service.addEligibleTitle(context.drawId, title(1, 'accessible'));
  const manifest = await context.service.closeDraw(context.drawId, finalizedAt);
  await context.service.requestRandomness(context.drawId);
  const draw = await context.service.resolveDraw(context.drawId);
  return { ...context, manifest, draw };
}

describe('draw trust foundation', () => {
  it('closes a draw and freezes its eligibility snapshot', async () => {
    const { service, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1));
    const manifest = await service.closeDraw(drawId, finalizedAt);
    assert.equal(manifest.eligibleCount, '1');
    await assert.rejects(service.addEligibleTitle(drawId, title(2)), /draw_eligibility_frozen/);
  });

  it('cannot replace the commitment after closure', async () => {
    const { service, repository, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1));
    await service.closeDraw(drawId, finalizedAt);
    const closed = (await repository.get(drawId))!;
    await assert.rejects(repository.update({ ...closed, eligibilityCommitment: `sha256:${'0'.repeat(64)}` }), /closed_draw_snapshot_immutable/);
  });

  it('cannot close before the published close time', async () => {
    const { service, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1));
    await assert.rejects(service.closeDraw(drawId, '2026-09-30T19:59:59.999Z'), /draw_close_time_not_reached/);
  });

  it('orders manifests deterministically and excludes private owners', () => {
    const first = buildDrawManifest('draw-order', [title(9), title(2), title(5)], '2026-09-30T20:00:00.000Z');
    const second = buildDrawManifest('draw-order', [title(5), title(9), title(2)], '2026-10-01T00:00:00.000Z');
    assert.deepEqual(first.entries.map((entry) => entry.titleId), second.entries.map((entry) => entry.titleId));
    assert.equal(first.eligibilityCommitment, second.eligibilityCommitment);
    assert.equal(JSON.stringify(first).includes('private-user'), false);
  });

  it('produces the same commitment for the same manifest', () => {
    const manifest = buildDrawManifest('draw-root', [title(1), title(2)], '2026-09-30T20:00:00.000Z');
    assert.equal(computeManifestCommitment(manifest.drawId, manifest.entries), manifest.eligibilityCommitment);
  });

  it('changes the commitment when a manifest entry changes', () => {
    const first = buildDrawManifest('draw-root-change', [title(1), title(2)], '2026-09-30T20:00:00.000Z');
    const second = buildDrawManifest('draw-root-change', [title(1), title(3)], '2026-09-30T20:00:00.000Z');
    assert.notEqual(first.eligibilityCommitment, second.eligibilityCommitment);
  });

  it('selects the same winner for the same seed and snapshot', () => {
    const seed = 123456789n;
    assert.equal(selectWinningIndex(seed, 97n), selectWinningIndex(seed, 97n));
  });

  it('rejection-samples the incomplete 256-bit tail instead of naively reducing it', () => {
    const maximum = (1n << 256n) - 1n;
    assert.notEqual(selectWinningIndex(maximum, 10n), maximum % 10n);
  });

  it('always selects zero for a one-title draw', () => {
    assert.equal(selectWinningIndex((1n << 256n) - 1n, 1n), 0n);
  });

  it('rejects a zero eligible count', () => {
    assert.throws(() => selectWinningIndex(1n, 0n), /eligible_count_invalid/);
  });

  it('derives multiple winners deterministically without duplicates', () => {
    const first = selectUniqueWinningIndices(99n, 100n, 25n, 'draw-multiple');
    const second = selectUniqueWinningIndices(99n, 100n, 25n, 'draw-multiple');
    assert.deepEqual(first, second);
    assert.equal(new Set(first).size, 25);
  });

  it('keeps a scratched title eligible', async () => {
    const { service, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1, 'purple', { scratchStatus: 'revealed' }));
    assert.equal((await service.closeDraw(drawId, finalizedAt)).eligibleCount, '1');
  });

  it('allows an archived title when the explicit eligibility rules still allow it', async () => {
    const { service, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1, 'purple', { lifecycleState: 'archived' }));
    assert.equal((await service.closeDraw(drawId, finalizedAt)).eligibleCount, '1');
  });

  it('rejects the wrong tier from a tier-exclusive draw', async () => {
    const { service, drawId } = await fixture('GOLD', ['gold']);
    await assert.rejects(service.addEligibleTitle(drawId, title(1, 'purple')), /title_not_eligible_for_draw/);
  });

  it('accepts each explicitly configured tier in a global draw', async () => {
    const { service, drawId } = await fixture();
    await service.addEligibleTitle(drawId, title(1, 'accessible'));
    await service.addEligibleTitle(drawId, title(2, 'purple'));
    await service.addEligibleTitle(drawId, title(3, 'gold'));
    assert.equal((await service.closeDraw(drawId, finalizedAt)).eligibleCount, '3');
  });

  it('rejects cross-campaign title leakage', async () => {
    const { service, drawId } = await fixture();
    await assert.rejects(service.addEligibleTitle(drawId, title(1, 'purple', { campaignId: 'other-campaign' })), /title_not_eligible_for_draw/);
  });

  it('treats issue time and drawEligible as published eligibility gates', async () => {
    const { repository, drawId } = await fixture();
    const draw = (await repository.get(drawId))!;
    assert.equal(isEligibleForDraw(draw, title(1, 'purple', { issuedAt: '2026-10-01T00:00:00.000Z' })), false);
    assert.equal(isEligibleForDraw(draw, title(2, 'purple', { drawEligible: false })), false);
  });

  it('reproduces a resolved winner in the fairness verifier', async () => {
    const { draw, manifest } = await resolvedFixture();
    const verified = verifyDraw(draw, manifest);
    assert.equal(verified.verified, true);
    assert.equal(verified.winningTitleId, draw.winningTitleId);
  });

  it('rejects an administrator-supplied winner that does not reproduce', async () => {
    const { repository, draw } = await resolvedFixture();
    await assert.rejects(repository.update({ ...draw, winningTitleId: 'administrator-choice' }), /resolved_draw_verification_failed/);
  });

  it('fails verification for a tampered manifest', async () => {
    const { draw, manifest } = await resolvedFixture();
    const entries = manifest.entries.map((entry, index) => index === 0 ? { ...entry, serial: 'TAMPERED-000001' } : entry);
    const tampered: DrawManifest = { ...manifest, entries };
    const verified = verifyDraw(draw, tampered);
    assert.equal(verified.verified, false);
    assert.equal(verified.manifestRootMatches, false);
  });

  it('returns a privacy-safe, independently verified fairness response', async () => {
    const { service, drawId } = await resolvedFixture();
    const fairness = await service.getFairness(drawId);
    assert.equal(fairness?.verificationStatus, 'VERIFIED');
    assert.equal(JSON.stringify(fairness).includes('private-user'), false);
  });

  it('serves the read-only fairness API without private owner data', async () => {
    const { service, drawId } = await resolvedFixture();
    const app = express();
    app.use('/api/draws', createDrawFairnessRouter(service));
    const server = await new Promise<Server>((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/draws/${drawId}/fairness`);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(body).verificationStatus, 'VERIFIED');
      assert.equal(body.includes('private-user'), false);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it('rejects substituted randomness responses', async () => {
    const valid = new LocalDeterministicDrawRandomnessProvider('test', 'repeatable-test-seed-v1');
    const substituting: DrawRandomnessProvider = {
      requestRandomness: (drawId) => valid.requestRandomness(drawId),
      getRandomness: async (requestId) => ({ ...(await valid.getRandomness(requestId)), requestId: 'substituted-request' }),
    };
    const repository = new DevelopmentMemoryDrawRepository();
    const service = new DrawService(repository, substituting);
    await service.createDraw({ id: 'draw-substitution', campaignId, eligibilityScope: 'PURPLE', allowedTierCodes: ['purple'], opensAt, closesAt });
    await service.openDraw('draw-substitution');
    await service.addEligibleTitle('draw-substitution', title(1));
    await service.closeDraw('draw-substitution', finalizedAt);
    await service.requestRandomness('draw-substitution');
    await assert.rejects(service.resolveDraw('draw-substitution'), /randomness_substitution_rejected/);
  });
});

describe('funding and liability invariants', () => {
  it('prevents Prize Vault liability from exceeding funding', () => {
    assert.throws(() => createVault({ id: 'v1', campaignId, vaultType: 'MONTHLY_PRIZE', fundedAmountUnits: 10n, committedLiabilityUnits: 11n }), /prize_liability_exceeds_funding/);
  });

  it('does not count Platform or Growth Treasury as Prize funding', () => {
    const vaults = [
      createVault({ id: 'p', campaignId, vaultType: 'MONTHLY_PRIZE', fundedAmountUnits: 60n, committedLiabilityUnits: 10n }),
      createVault({ id: 'o', campaignId, vaultType: 'PLATFORM', fundedAmountUnits: 20n, committedLiabilityUnits: 0n }),
      createVault({ id: 'g', campaignId, vaultType: 'GROWTH', fundedAmountUnits: 10n, committedLiabilityUnits: 0n }),
    ];
    assert.equal(totalPrizeFunding(vaults), 60n);
    assert.throws(() => createVault({ id: 'bad', campaignId, vaultType: 'PLATFORM', fundedAmountUnits: 20n, committedLiabilityUnits: 1n }), /treasury_cannot_hold_prize_liability/);
  });

  it('tracks renewal liability separately and never makes it spendable', () => {
    const liability = createRenewalLiability({ id: 'r1', sourceTitleId: 'title-1', creditUnits: 5n, fundingSource: 'UNDECIDED', funded: false, status: 'MODELED' });
    assert.equal(liability.spendable, false);
    assert.equal(liability.fundingSource, 'UNDECIDED');
    assert.throws(() => createRenewalLiability({ id: 'r2', sourceTitleId: 'title-2', creditUnits: 5n, fundingSource: 'UNDECIDED', funded: true, status: 'FUNDED' }), /renewal_funding_source_required/);
  });

  it('prevents a scratch batch maximum liability from exceeding funding', () => {
    assert.throws(() => createScratchBatch({ id: 'b1', campaignId, tierId: 'purple', titleCapacity: 100n, fundedPrizeUnits: 99n, maximumPrizeLiabilityUnits: 100n, issuedCount: 0n, status: 'DRAFT' }), /scratch_liability_exceeds_funding/);
    const batch = createScratchBatch({ id: 'b2', campaignId, tierId: 'purple', titleCapacity: 100n, fundedPrizeUnits: 100n, maximumPrizeLiabilityUnits: 100n, issuedCount: 25n, status: 'FUNDED' });
    assert.equal(batch.issuedCount, 25n);
  });

  it('fails closed when deterministic draw randomness is constructed for production', () => {
    assert.throws(() => new LocalDeterministicDrawRandomnessProvider('production', 'repeatable-test-seed-v1'), /local_draw_randomness_forbidden/);
    assert.throws(() => new LocalDeterministicDrawRandomnessProvider('test', 'short'), /local_draw_randomness_seed_invalid/);
  });
});
