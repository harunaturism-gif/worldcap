import { buildDrawManifest } from './drawManifest.js';
import type { DrawRandomnessProvider } from './drawRandomness.js';
import type { DrawRepository } from './drawRepository.js';
import { parseRandomnessSeed, selectWinningIndex } from './drawSelection.js';
import {
  DRAW_ALGORITHM_VERSION, DRAW_MANIFEST_VERSION, type DrawEligibilityCandidate, type DrawEligibilityScope,
  type DrawFairnessResponse, type DrawManifest, type DrawRecord,
} from './drawTypes.js';
import { verifyDraw } from './verifyDraw.js';

function tierAllowed(draw: DrawRecord, title: DrawEligibilityCandidate): boolean {
  if (!draw.allowedTierCodes.includes(title.tierCode)) return false;
  if (draw.eligibilityScope === 'GLOBAL') return true;
  return draw.eligibilityScope === title.tierCode.toUpperCase();
}

export function isEligibleForDraw(draw: DrawRecord, title: DrawEligibilityCandidate): boolean {
  return draw.status === 'OPEN'
    && draw.campaignId !== null
    && title.campaignId === draw.campaignId
    && title.drawEligible
    && Date.parse(title.issuedAt) <= Date.parse(draw.closesAt)
    && tierAllowed(draw, title);
}

export class DrawService {
  private readonly candidates = new Map<string, Map<string, DrawEligibilityCandidate>>();
  private readonly closeLocks = new Map<string, Promise<void>>();

  constructor(private readonly repository: DrawRepository, private readonly randomness: DrawRandomnessProvider) {}

  async createDraw(input: { id: string; campaignId: string; eligibilityScope: DrawEligibilityScope; allowedTierCodes: readonly string[]; opensAt: string; closesAt: string }): Promise<DrawRecord> {
    if (!input.id || !input.campaignId || input.allowedTierCodes.length === 0 || new Set(input.allowedTierCodes).size !== input.allowedTierCodes.length) throw new Error('draw_configuration_invalid');
    if (!Number.isFinite(Date.parse(input.opensAt)) || !Number.isFinite(Date.parse(input.closesAt)) || Date.parse(input.opensAt) >= Date.parse(input.closesAt)) throw new Error('draw_window_invalid');
    return this.repository.create({
      ...input, allowedTierCodes: Object.freeze([...input.allowedTierCodes]), status: 'DRAFT', eligibleTitleCount: 0n,
      eligibilityCommitment: null, manifestVersion: DRAW_MANIFEST_VERSION, algorithmVersion: DRAW_ALGORITHM_VERSION,
      randomnessProvider: null, randomnessRequestId: null, randomnessSeed: null, winningIndex: null,
      winningTitleId: null, finalizedAt: null, payoutStatus: 'NOT_READY',
    });
  }

  async openDraw(drawId: string): Promise<DrawRecord> {
    const draw = await this.requireDraw(drawId);
    if (draw.status !== 'DRAFT') throw new Error('draw_cannot_open');
    draw.status = 'OPEN';
    this.candidates.set(draw.id, new Map());
    return this.repository.update(draw);
  }

  async addEligibleTitle(drawId: string, title: DrawEligibilityCandidate): Promise<void> {
    const draw = await this.requireDraw(drawId);
    if (draw.status !== 'OPEN') throw new Error('draw_eligibility_frozen');
    if (!isEligibleForDraw(draw, title)) throw new Error('title_not_eligible_for_draw');
    const entries = this.candidates.get(drawId);
    if (!entries) throw new Error('draw_candidate_store_unavailable');
    entries.set(title.id, Object.freeze({ ...title }));
  }

  async closeDraw(drawId: string, closedAt = new Date().toISOString()): Promise<DrawManifest> {
    return this.withCloseLock(drawId, async () => {
      const draw = await this.requireDraw(drawId);
      if (draw.status !== 'OPEN') {
        const frozen = await this.repository.getManifest(drawId);
        if (frozen && draw.status !== 'DRAFT') return frozen;
        throw new Error('draw_cannot_close');
      }
      if (!Number.isFinite(Date.parse(closedAt)) || Date.parse(closedAt) < Date.parse(draw.closesAt)) throw new Error('draw_close_time_not_reached');
      const entries = [...(this.candidates.get(drawId)?.values() ?? [])];
      const manifest = buildDrawManifest(drawId, entries, closedAt);
      await this.repository.saveManifest(drawId, manifest);
      draw.status = 'CLOSED';
      draw.eligibleTitleCount = BigInt(manifest.entries.length);
      draw.eligibilityCommitment = manifest.eligibilityCommitment;
      draw.finalizedAt = closedAt;
      await this.repository.update(draw);
      this.candidates.delete(drawId);
      return manifest;
    });
  }

  async requestRandomness(drawId: string): Promise<DrawRecord> {
    const draw = await this.requireDraw(drawId);
    if (draw.status !== 'CLOSED') throw new Error('draw_not_ready_for_randomness');
    const request = await this.randomness.requestRandomness(drawId);
    if (request.drawId !== drawId) throw new Error('randomness_draw_mismatch');
    draw.status = 'RANDOMNESS_PENDING';
    draw.randomnessProvider = request.provider;
    draw.randomnessRequestId = request.requestId;
    return this.repository.update(draw);
  }

  async resolveDraw(drawId: string): Promise<DrawRecord> {
    const draw = await this.requireDraw(drawId);
    if (draw.status !== 'RANDOMNESS_PENDING' || !draw.randomnessRequestId || !draw.randomnessProvider) throw new Error('draw_not_awaiting_randomness');
    const result = await this.randomness.getRandomness(draw.randomnessRequestId);
    if (result.requestId !== draw.randomnessRequestId || result.provider !== draw.randomnessProvider) throw new Error('randomness_substitution_rejected');
    const manifest = await this.repository.getManifest(drawId);
    if (!manifest || manifest.eligibilityCommitment !== draw.eligibilityCommitment) throw new Error('draw_manifest_unavailable');
    const winningIndex = selectWinningIndex(parseRandomnessSeed(result.seed), draw.eligibleTitleCount);
    const winner = manifest.entries[Number(winningIndex)];
    if (!winner) throw new Error('winning_title_unavailable');
    draw.randomnessSeed = result.seed.toLowerCase();
    draw.winningIndex = winningIndex;
    draw.winningTitleId = winner.titleId;
    draw.status = 'RESOLVED';
    draw.payoutStatus = 'PENDING';
    return this.repository.update(draw);
  }

  async getManifest(drawId: string): Promise<DrawManifest | null> { return this.repository.getManifest(drawId); }

  async getFairness(drawId: string): Promise<DrawFairnessResponse | null> {
    const draw = await this.repository.get(drawId);
    if (!draw) return null;
    const manifest = await this.repository.getManifest(drawId);
    const verification = manifest && draw.status === 'RESOLVED' ? verifyDraw(draw, manifest) : null;
    const winningTitle = verification?.winningTitle ?? null;
    return {
      drawId: draw.id, status: draw.status, eligibilityScope: draw.eligibilityScope,
      allowedTierCodes: [...draw.allowedTierCodes], eligibleCount: draw.eligibleTitleCount.toString(),
      snapshotCommitment: draw.eligibilityCommitment, manifestVersion: draw.manifestVersion,
      randomnessProvider: draw.randomnessProvider, randomnessSeed: draw.randomnessSeed,
      algorithmVersion: draw.algorithmVersion, winningIndex: draw.winningIndex?.toString() ?? null,
      winningTitle, verificationStatus: draw.status === 'RESOLVED' ? (verification?.verified ? 'VERIFIED' : 'FAILED') : draw.status === 'RANDOMNESS_PENDING' ? 'PENDING' : 'NOT_READY',
      payoutStatus: draw.payoutStatus,
    };
  }

  private async requireDraw(drawId: string): Promise<DrawRecord> {
    const draw = await this.repository.get(drawId);
    if (!draw) throw new Error('draw_not_found');
    return draw;
  }

  private async withCloseLock<T>(drawId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.closeLocks.get(drawId) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.closeLocks.set(drawId, current);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.closeLocks.get(drawId) === current) this.closeLocks.delete(drawId);
    }
  }
}
