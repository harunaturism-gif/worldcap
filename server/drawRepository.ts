import type { DrawManifest, DrawRecord } from './drawTypes.js';
import { verifyDraw } from './verifyDraw.js';
import type { RandomnessEvidence } from './verifyDrawV2.js';

export interface DrawRepository {
  create(draw: DrawRecord): Promise<DrawRecord>;
  get(drawId: string): Promise<DrawRecord | null>;
  update(draw: DrawRecord): Promise<DrawRecord>;
  saveManifest(drawId: string, manifest: DrawManifest): Promise<void>;
  getManifest(drawId: string): Promise<DrawManifest | null>;
  getRandomnessEvidence(drawId: string): Promise<RandomnessEvidence | null>;
}

function cloneDraw(draw: DrawRecord): DrawRecord {
  return { ...draw, allowedTierCodes: [...draw.allowedTierCodes] };
}

function cloneManifest(manifest: DrawManifest): DrawManifest {
  return { ...manifest, entries: manifest.entries.map((entry) => ({ ...entry })) };
}

export class DevelopmentMemoryDrawRepository implements DrawRepository {
  private readonly draws = new Map<string, DrawRecord>();
  private readonly manifests = new Map<string, DrawManifest>();

  async create(draw: DrawRecord): Promise<DrawRecord> {
    if (this.draws.has(draw.id)) throw new Error('draw_already_exists');
    this.draws.set(draw.id, cloneDraw(draw));
    return cloneDraw(draw);
  }

  async get(drawId: string): Promise<DrawRecord | null> {
    const draw = this.draws.get(drawId);
    return draw ? cloneDraw(draw) : null;
  }

  async update(draw: DrawRecord): Promise<DrawRecord> {
    const existing = this.draws.get(draw.id);
    if (!existing) throw new Error('draw_not_found');
    const allowedTransitions: Record<DrawRecord['status'], readonly DrawRecord['status'][]> = {
      DRAFT: ['OPEN'], OPEN: ['CLOSED'], CLOSED: ['RANDOMNESS_PENDING'], RANDOMNESS_PENDING: ['RESOLVED'], RESOLVED: ['SETTLED'], SETTLED: [],
    };
    if (draw.status !== existing.status && !allowedTransitions[existing.status].includes(draw.status)) throw new Error('draw_status_transition_invalid');
    if (existing.status !== 'DRAFT' && existing.status !== 'OPEN') {
      if (existing.eligibilityCommitment !== draw.eligibilityCommitment || existing.eligibleTitleCount !== draw.eligibleTitleCount) throw new Error('closed_draw_snapshot_immutable');
    }
    if (draw.status !== 'RESOLVED' && draw.status !== 'SETTLED' && (draw.randomnessSeed !== null || draw.winningIndex !== null || draw.winningTitleId !== null)) throw new Error('winner_before_resolution');
    if (draw.status === 'RESOLVED' || draw.status === 'SETTLED') {
      const manifest = this.manifests.get(draw.id);
      if (!manifest || !verifyDraw(draw, manifest).verified) throw new Error('resolved_draw_verification_failed');
    }
    this.draws.set(draw.id, cloneDraw(draw));
    return cloneDraw(draw);
  }

  async saveManifest(drawId: string, manifest: DrawManifest): Promise<void> {
    const existing = this.manifests.get(drawId);
    if (existing && existing.eligibilityCommitment !== manifest.eligibilityCommitment) throw new Error('draw_manifest_immutable');
    if (!existing) this.manifests.set(drawId, cloneManifest(manifest));
  }

  async getManifest(drawId: string): Promise<DrawManifest | null> {
    const manifest = this.manifests.get(drawId);
    return manifest ? cloneManifest(manifest) : null;
  }

  async getRandomnessEvidence(drawId: string): Promise<RandomnessEvidence | null> {
    const draw = this.draws.get(drawId);
    if (!draw?.randomnessRequestId || !draw.randomnessProvider) return null;
    return { requestId: draw.randomnessRequestId, provider: draw.randomnessProvider, network: 'local-test', independentlyVerified: draw.status === 'RESOLVED' || draw.status === 'SETTLED' };
  }
}
