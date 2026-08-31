import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectWinningIndex,
} from './drawSelection.js';
import {
  buildDrawManifest,
} from './drawManifest.js';
import { verifyDraw } from './verifyDraw.js';
import { DevelopmentMemoryDrawRepository } from './drawRepository.js';
import { DrawService } from './drawService.js';
import { LocalDeterministicDrawRandomnessProvider } from './drawRandomness.js';
import { DrawRecord } from './drawTypes.js';

describe('Adversarial Tests', () => {

  it('test modulo bias rejection sampling bounds', () => {
    const eligibleCount = 100n;
    const sampleSpace = 1n << 256n;
    const acceptanceLimit = sampleSpace - (sampleSpace % eligibleCount);

    // Testing rejection sampling by feeding an exact value that should trigger a re-roll.
    const seedRejection = acceptanceLimit;

    const result = selectWinningIndex(seedRejection, eligibleCount);
    assert.ok(result >= 0n && result < eligibleCount);
  });

  it('test seed 0', () => {
     const result = selectWinningIndex(0n, 100n);
     assert.equal(result, 0n);
  });

  it('test max uint256', () => {
     const result = selectWinningIndex((1n << 256n) - 1n, 100n);
     assert.equal(result, 48n);
  });

  it('test duplicate title ID in manifest', () => {
    const d1 = { id: 'dup', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };
    const d2 = { id: 'dup', serial: '02', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o2', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };
    assert.throws(() => {
        buildDrawManifest('draw1', [d1, d2], new Date().toISOString());
    }, /manifest_duplicate_title/);
  });

  it('test admin reopen draw', async () => {
    const repo = new DevelopmentMemoryDrawRepository();
    const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
    const service = new DrawService(repo, provider);

    await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
    await service.openDraw('d1');
    const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };
    await service.addEligibleTitle('d1', title1);
    await service.closeDraw('d1', new Date(Date.now() + 2000).toISOString());

    await assert.rejects(service.openDraw('d1'), /draw_cannot_open/);
  });

  it('test Verify Draw trusting stored values', async () => {
     const repo = new DevelopmentMemoryDrawRepository();
     const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
     const service = new DrawService(repo, provider);

     const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };

     await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
     await service.openDraw('d1');
     await service.addEligibleTitle('d1', title1);
     const manifest = await service.closeDraw('d1', new Date(Date.now() + 2000).toISOString());
     await service.requestRandomness('d1');
     const resolvedDraw = await service.resolveDraw('d1');

     const tamperedDraw: DrawRecord = { ...resolvedDraw };
     tamperedDraw.winningTitleId = 't2';
     tamperedDraw.winningIndex = 1n;
     tamperedDraw.eligibleTitleCount = 2n;

     const verifyTampered = verifyDraw(tamperedDraw, manifest);
     assert.equal(verifyTampered.verified, false);
     assert.ok(verifyTampered.errors.includes('eligible_count_mismatch'));
  });

  it('test resolving twice', async () => {
     const repo = new DevelopmentMemoryDrawRepository();
     const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
     const service = new DrawService(repo, provider);

     const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };

     await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
     await service.openDraw('d1');
     await service.addEligibleTitle('d1', title1);
     await service.closeDraw('d1', new Date(Date.now() + 2000).toISOString());
     await service.requestRandomness('d1');
     await service.resolveDraw('d1');

     await assert.rejects(service.resolveDraw('d1'), /draw_not_awaiting_randomness/);
  });

  it('test resolving before closure', async () => {
     const repo = new DevelopmentMemoryDrawRepository();
     const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
     const service = new DrawService(repo, provider);

     const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };

     await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
     await service.openDraw('d1');
     await service.addEligibleTitle('d1', title1);

     await assert.rejects(service.resolveDraw('d1'), /draw_not_awaiting_randomness/);
  });

  it('test very large eligible counts', () => {
     const max256 = (1n << 256n) - 1n;
     assert.throws(() => selectWinningIndex(max256, (1n << 256n) + 1n), /eligible_count_invalid/);
  });

  it('test missing draw verification fields on update', async () => {
     const repo = new DevelopmentMemoryDrawRepository();
     const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
     const service = new DrawService(repo, provider);

     const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };

     await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
     await service.openDraw('d1');
     await service.addEligibleTitle('d1', title1);
     await service.closeDraw('d1', new Date(Date.now() + 2000).toISOString());
     await service.requestRandomness('d1');

     const draw = await repo.get('d1');
     if (!draw) throw new Error("Draw not found");
     draw.status = 'RESOLVED';

     await assert.rejects(repo.update(draw), /resolved_draw_verification_failed/);
  });

  it('test duplicate manifests overwrite', async () => {
    const repo = new DevelopmentMemoryDrawRepository();
    const provider = new LocalDeterministicDrawRandomnessProvider('test', '0123456789abcdef0123456789abcdef');
    const service = new DrawService(repo, provider);

    await service.createDraw({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 1000).toISOString() });
    await service.openDraw('d1');
    const title1 = { id: 't1', serial: '01', campaignId: 'c1', tierCode: 'purple' as const, currentOwnerId: 'o1', issuedAt: '2020-01-01', drawEligible: true, lifecycleState: 'active' as const, scratchStatus: 'available' as const };
    await service.addEligibleTitle('d1', title1);

    const manifest1 = await service.closeDraw('d1', new Date(Date.now() + 2000).toISOString());

    const tamperedManifest = { ...manifest1, eligibilityCommitment: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' };

    await assert.rejects(repo.saveManifest('d1', tamperedManifest), /draw_manifest_immutable/);
  });

  it('test 1-entry draw and 0-entry draw selection', () => {
     assert.equal(selectWinningIndex(123456n, 1n), 0n);
     assert.throws(() => selectWinningIndex(1234n, 0n), /eligible_count_invalid/);
  });

  it('test repository state transitions constraints', async () => {
     const repo = new DevelopmentMemoryDrawRepository();
     const draw = await repo.create({ id: 'd1', campaignId: 'c1', eligibilityScope: 'GLOBAL', allowedTierCodes: ['purple'], opensAt: '2020', closesAt: '2021', status: 'DRAFT', eligibleTitleCount: 0n, eligibilityCommitment: null, manifestVersion: 'worldcap-manifest-v1', algorithmVersion: 'worldcap-draw-v1', randomnessProvider: null, randomnessRequestId: null, randomnessSeed: null, winningIndex: null, winningTitleId: null, finalizedAt: null, payoutStatus: 'NOT_READY' });

     const openDraw = { ...draw, status: 'OPEN' as const };
     await repo.update(openDraw);

     const draftDraw = { ...openDraw, status: 'DRAFT' as const };
     await assert.rejects(repo.update(draftDraw), /draw_status_transition_invalid/);

     const resolvedDraw = { ...openDraw, status: 'RESOLVED' as const };
     await assert.rejects(repo.update(resolvedDraw), /draw_status_transition_invalid/);
  });
});
