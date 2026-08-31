import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DurableDrawCoordinator, MemoryDrawCoordinatorStore } from './drawCoordinator.js';
import { LocalDeterministicDrawRandomnessProvider, type DrawRandomnessProvider } from './drawRandomness.js';
import { DevelopmentMemoryDrawRepository } from './drawRepository.js';
import { DrawService } from './drawService.js';
import type { DrawEligibilityCandidate } from './drawTypes.js';
import { computeArtifactContentHash, createPublicDrawArtifact, serializePublicDrawArtifact } from './publicManifest.js';
import { verifyDrawV2 } from './verifyDrawV2.js';
import {
  createWitnetConfig, PinnedWitnetChainAdapter, WitnetDrawRandomnessProvider,
  type WitnetChainAdapter, type WitnetConfig, type WitnetReadTransport,
} from './witnetRandomness.js';
import { algorithmVersionHash, MemoryCommitmentAnchor } from './commitmentAnchor.js';
import {
  SupabaseDurableDrawCoordinator, type DrawCoordinatorPersistence, type PersistedCoordinatorJob,
} from './supabaseDrawCoordinator.js';

const campaignId = 'campaign-beta';
const finalTime = '2026-10-01T00:00:01.000Z';
const title: DrawEligibilityCandidate = {
  id: 'beta-title-1', serial: 'PURPLE-BETA-000001', campaignId, tierCode: 'purple',
  currentOwnerId: 'private-user-must-not-publish', issuedAt: '2026-09-01T00:00:00.000Z',
  drawEligible: true, lifecycleState: 'active', scratchStatus: 'revealed',
};

class CountingProvider implements DrawRandomnessProvider {
  readonly delegate = new LocalDeterministicDrawRandomnessProvider('test', 'closed-beta-repeatable-seed');
  requestCount = 0;
  fulfillmentCount = 0;
  async requestRandomness(drawId: string) { this.requestCount += 1; return this.delegate.requestRandomness(drawId); }
  async getRandomness(requestId: string) { this.fulfillmentCount += 1; return this.delegate.getRandomness(requestId); }
}

class DurableFixturePersistence implements DrawCoordinatorPersistence {
  job: PersistedCoordinatorJob = {
    drawId: 'durable-beta-draw', provider: 'witnet-randomness-v1', network: 'world-chain-sepolia', status: 'prepared',
    requestId: null, transactionHash: null, requestBlock: null, randomnessSeed: null, proofReference: null,
    attemptCount: 0, lastError: null,
  };
  async prepare() { this.job.attemptCount += 1; return structuredClone(this.job); }
  async get() { return structuredClone(this.job); }
  async bind(_drawId: string, request: Awaited<ReturnType<DrawRandomnessProvider['requestRandomness']>>) {
    this.job = { ...this.job, status: 'request_bound', requestId: request.requestId, transactionHash: request.transactionHash!, requestBlock: request.requestBlock! };
  }
  async fulfill(_drawId: string, _provider: string, _network: string, result: Awaited<ReturnType<DrawRandomnessProvider['getRandomness']>>) {
    this.job = { ...this.job, status: 'fulfilled', randomnessSeed: result.seed, proofReference: result.proofReference! };
  }
  async resolve() { this.job = { ...this.job, status: 'resolved' }; }
  async fail(_drawId: string, reason: string) { this.job = { ...this.job, status: 'failed', lastError: reason }; }
}

class DurableFixtureProvider implements DrawRandomnessProvider {
  requests = 0; fulfillments = 0;
  async requestRandomness(drawId: string) {
    this.requests += 1;
    return { drawId, requestId: `witnet:4801:100:0x${'a'.repeat(64)}`, provider: 'witnet-randomness-v1', requestedAt: finalTime, transactionHash: `0x${'a'.repeat(64)}`, requestBlock: 100n, network: 'world-chain-sepolia' };
  }
  async getRandomness(requestId: string) {
    this.fulfillments += 1;
    return { requestId, provider: 'witnet-randomness-v1', seed: `0x${'b'.repeat(64)}`, fulfilledAt: finalTime, proofReference: 'eip155:4801:0x1111111111111111111111111111111111111111:randomize-block:100' };
  }
}

async function closedDraw(provider: DrawRandomnessProvider = new CountingProvider()) {
  const repository = new DevelopmentMemoryDrawRepository();
  const service = new DrawService(repository, provider);
  await service.createDraw({ id: 'beta-draw', campaignId, eligibilityScope: 'PURPLE', allowedTierCodes: ['purple'], opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-10-01T00:00:00.000Z' });
  await service.openDraw('beta-draw');
  await service.addEligibleTitle('beta-draw', title);
  const manifest = await service.closeDraw('beta-draw', finalTime);
  return { repository, service, manifest };
}

describe('closed beta trust vertical', () => {
  it('publishes a deterministic privacy-safe artifact', async () => {
    const { repository, manifest } = await closedDraw();
    const draw = (await repository.get('beta-draw'))!;
    const first = createPublicDrawArtifact(draw, manifest);
    const second = createPublicDrawArtifact(draw, manifest);
    assert.equal(first.artifactContentHash, second.artifactContentHash);
    assert.equal(computeArtifactContentHash(first), first.artifactContentHash);
    assert.equal(serializePublicDrawArtifact(first).includes(title.currentOwnerId), false);
    const tampered = { ...first, entries: [{ ...first.entries[0]!, serial: 'SUBSTITUTED-SERIAL' }] };
    assert.notEqual(computeArtifactContentHash(tampered), first.artifactContentHash);
  });

  it('survives coordinator restart without a duplicate randomness request', async () => {
    const provider = new CountingProvider();
    const { service } = await closedDraw(provider);
    const store = new MemoryDrawCoordinatorStore();
    const firstWorker = new DurableDrawCoordinator(service, store, 'local-deterministic-draw-v1', 'local-test');
    const resolved = await firstWorker.run('beta-draw');
    assert.equal(resolved.status, 'RESOLVED');
    const restartedWorker = new DurableDrawCoordinator(service, store, 'local-deterministic-draw-v1', 'local-test');
    assert.equal((await restartedWorker.run('beta-draw')).status, 'RESOLVED');
    assert.equal(provider.requestCount, 1);
    assert.equal(provider.fulfillmentCount, 1);
  });

  it('Verify Draw V2 recomputes every required component', async () => {
    const provider = new CountingProvider();
    const { repository, service, manifest } = await closedDraw(provider);
    await service.requestRandomness('beta-draw');
    const draw = await service.resolveDraw('beta-draw');
    const artifact = createPublicDrawArtifact(draw, manifest);
    const verified = verifyDrawV2({
      draw, artifact,
      randomness: { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true },
      anchor: { required: false, exists: false, drawId: draw.id, manifestRoot: null, eligibleCount: null, algorithmVersionHash: null, verified: false },
    });
    assert.equal(verified.verified, true);
    assert.equal(verified.anchorAvailable, false);
    assert.equal(verified.anchorVerified, false);
    const stored = (await repository.get('beta-draw'))!;
    assert.equal(verified.winningTitle, 'PURPLE-BETA-000001');
    assert.equal(stored.winningTitleId, title.id);
  });

  it('requires a configured anchor to match every committed field', async () => {
    const provider = new CountingProvider();
    const { service, manifest } = await closedDraw(provider);
    await service.requestRandomness('beta-draw');
    const draw = await service.resolveDraw('beta-draw');
    const artifact = createPublicDrawArtifact(draw, manifest);
    const result = verifyDrawV2({
      draw, artifact,
      randomness: { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true },
      anchor: { required: true, exists: true, drawId: draw.id, manifestRoot: artifact.manifestRoot, eligibleCount: artifact.eligibleCount, algorithmVersionHash: algorithmVersionHash('substituted-version'), verified: true },
    });
    assert.equal(result.anchorVerified, false);
    assert.equal(result.verified, false);
    assert.deepEqual(result.errors, ['anchor_verification_failed']);
  });

  it('Verify Draw V2 rejects commitment and stored-winner substitution', async () => {
    const provider = new CountingProvider();
    const { service, manifest } = await closedDraw(provider);
    await service.requestRandomness('beta-draw');
    const draw = await service.resolveDraw('beta-draw');
    const artifact = createPublicDrawArtifact(draw, manifest);
    const result = verifyDrawV2({
      draw: { ...draw, winningTitleId: 'substituted-title' },
      artifact: { ...artifact, artifactContentHash: `sha256:${'0'.repeat(64)}` },
      randomness: { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: true },
    });
    assert.equal(result.verified, false);
    assert.equal(result.manifestVerified, false);
    assert.equal(result.winnerVerified, false);
  });

  it('fails closed for incomplete or non-Sepolia Witnet configuration', () => {
    assert.equal(createWitnetConfig({ WITNET_NETWORK: 'world-chain-sepolia', WORLD_CHAIN_CHAIN_ID: '480', WORLD_CHAIN_RPC_URL: 'https://example.test', WITNET_RANDOMNESS_CONTRACT: `0x${'1'.repeat(40)}` }), null);
    assert.equal(createWitnetConfig({ WITNET_NETWORK: 'world-chain-sepolia', WORLD_CHAIN_CHAIN_ID: '4801', WORLD_CHAIN_RPC_URL: 'http://example.test', WITNET_RANDOMNESS_CONTRACT: `0x${'1'.repeat(40)}` }), null);
  });

  it('binds Witnet fulfillment to the exact stored request', async () => {
    const config: WitnetConfig = { network: 'world-chain-sepolia', chainId: 4801, rpcUrl: 'https://worldchain-sepolia.g.alchemy.com/public', randomnessContract: `0x${'1'.repeat(40)}` };
    const adapter: WitnetChainAdapter = {
      async assertPinnedDeployment() {},
      async requestOrRecover() { return { requestId: 'witnet:4801:100:0xabc', requestBlock: 100n, transactionHash: '0xabc', requestedAt: finalTime }; },
      async readFulfillment(_config, requestId) { return { requestId: `${requestId}-wrong`, status: 'ready', seed: `0x${'2'.repeat(64)}` }; },
    };
    const provider = new WitnetDrawRandomnessProvider(config, adapter);
    const request = await provider.requestRandomness('beta-draw');
    await assert.rejects(provider.getRandomness(request.requestId), /witnet_request_binding_mismatch/);
  });

  it('reads a pinned Witnet request from World Chain Sepolia without substituting its boundary', async () => {
    const config: WitnetConfig = { network: 'world-chain-sepolia', chainId: 4801, rpcUrl: 'https://worldchain-sepolia.g.alchemy.com/public', randomnessContract: `0x${'1'.repeat(40)}` };
    const reader: WitnetReadTransport = {
      async chainId() { return 4801; }, async bytecode() { return '0x6000'; },
      async status() { return 2; }, async seed() { return `0x${'2'.repeat(64)}`; },
    };
    let submissions = 0;
    const chain = new PinnedWitnetChainAdapter(reader, { async requestOrRecover() { submissions += 1; return { requestBlock: 100n, transactionHash: `0x${'a'.repeat(64)}`, requestedAt: finalTime }; } });
    const provider = new WitnetDrawRandomnessProvider(config, chain);
    const request = await provider.requestRandomness('beta-draw');
    const result = await provider.getRandomness(request.requestId);
    assert.equal(submissions, 1);
    assert.equal(request.requestId, `witnet:4801:100:0x${'a'.repeat(64)}`);
    assert.equal(result.proofReference, `eip155:4801:${config.randomnessContract}:randomize-block:100`);
  });

  it('restarts the Supabase-shaped coordinator without a second external request', async () => {
    const persistence = new DurableFixturePersistence();
    const provider = new DurableFixtureProvider();
    const first = new SupabaseDurableDrawCoordinator(persistence, provider, 'witnet-randomness-v1', 'world-chain-sepolia');
    assert.equal((await first.run('durable-beta-draw')).status, 'resolved');
    const restarted = new SupabaseDurableDrawCoordinator(persistence, provider, 'witnet-randomness-v1', 'world-chain-sepolia');
    assert.equal((await restarted.run('durable-beta-draw')).status, 'resolved');
    assert.equal(provider.requests, 1);
    assert.equal(provider.fulfillments, 1);
  });

  it('rejects commitment anchor overwrite', () => {
    const registry = new MemoryCommitmentAnchor();
    registry.anchor('beta-draw', `sha256:${'1'.repeat(64)}`, 1n, 'worldcap-draw-v1');
    assert.throws(() => registry.anchor('beta-draw', `sha256:${'2'.repeat(64)}`, 2n, 'worldcap-draw-v1'), /draw_anchor_immutable/);
  });

  it('rejects replayed randomness persistence and provider substitution', async () => {
    const store = new MemoryDrawCoordinatorStore();
    let job = await store.getOrCreate('replay-draw', 'witnet-randomness-v1', 'world-chain-sepolia', 'worldcap-draw-v1');
    await assert.rejects(store.getOrCreate('replay-draw', 'other-provider', 'world-chain-sepolia', 'worldcap-draw-v1'), /coordinator_provider_substitution/);
    job = await store.save({ ...job, requestId: 'witnet:4801:100', status: 'REQUEST_BOUND' });
    job = await store.save({ ...job, randomnessSeed: `0x${'3'.repeat(64)}`, status: 'RESOLVED' });
    await assert.rejects(store.save({ ...job }), /randomness_response_replayed/);
  });
});
