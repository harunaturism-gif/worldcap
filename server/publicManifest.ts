import { createHash } from 'node:crypto';
import type { DrawManifest, DrawRecord, PublicManifestEntry } from './drawTypes.js';

export const PUBLIC_DRAW_SCHEMA_VERSION = 'worldcap-public-draw-v1' as const;

export interface PublicDrawArtifact {
  schemaVersion: typeof PUBLIC_DRAW_SCHEMA_VERSION;
  algorithmVersion: string;
  drawId: string;
  campaignId: string;
  scope: string;
  closedAt: string;
  eligibleCount: string;
  manifestRoot: string;
  artifactContentHash: string;
  entries: readonly PublicManifestEntry[];
}

function prefix(value: string): string { return `${Buffer.byteLength(value, 'utf8')}:${value}`; }

export function computeArtifactContentHash(input: Omit<PublicDrawArtifact, 'artifactContentHash' | 'entries'>): string {
  const canonical = [input.schemaVersion, input.algorithmVersion, input.drawId, input.campaignId, input.scope, input.closedAt, input.eligibleCount, input.manifestRoot].map(prefix).join('|');
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function createPublicDrawArtifact(draw: DrawRecord, manifest: DrawManifest): PublicDrawArtifact {
  if (!draw.campaignId || !draw.finalizedAt || !draw.eligibilityCommitment || draw.eligibilityCommitment !== manifest.eligibilityCommitment) throw new Error('public_artifact_draw_not_finalized');
  const base = {
    schemaVersion: PUBLIC_DRAW_SCHEMA_VERSION,
    algorithmVersion: draw.algorithmVersion,
    drawId: draw.id,
    campaignId: draw.campaignId,
    scope: draw.eligibilityScope,
    closedAt: draw.finalizedAt,
    eligibleCount: draw.eligibleTitleCount.toString(),
    manifestRoot: draw.eligibilityCommitment,
  } as const;
  return Object.freeze({ ...base, artifactContentHash: computeArtifactContentHash(base), entries: Object.freeze(manifest.entries.map((entry) => Object.freeze({ ...entry }))) });
}

export function serializePublicDrawArtifact(artifact: PublicDrawArtifact): string {
  return JSON.stringify({
    schemaVersion: artifact.schemaVersion, algorithmVersion: artifact.algorithmVersion,
    drawId: artifact.drawId, campaignId: artifact.campaignId, scope: artifact.scope,
    closedAt: artifact.closedAt, eligibleCount: artifact.eligibleCount,
    manifestRoot: artifact.manifestRoot, artifactContentHash: artifact.artifactContentHash,
    entries: artifact.entries.map((entry) => ({ index: entry.index, titleId: entry.titleId, serial: entry.serial, tier: entry.tier, campaignId: entry.campaignId })),
  });
}

export interface ManifestPublisher {
  publish(artifact: PublicDrawArtifact): Promise<{ uri: string; replayed: boolean }>;
  get(drawId: string): Promise<PublicDrawArtifact | null>;
}

export class LocalMemoryManifestPublisher implements ManifestPublisher {
  private readonly artifacts = new Map<string, PublicDrawArtifact>();
  async publish(artifact: PublicDrawArtifact) {
    const existing = this.artifacts.get(artifact.drawId);
    if (existing && existing.artifactContentHash !== artifact.artifactContentHash) throw new Error('published_manifest_immutable');
    if (!existing) this.artifacts.set(artifact.drawId, artifact);
    return { uri: `/api/draws/${encodeURIComponent(artifact.drawId)}/artifact`, replayed: Boolean(existing) };
  }
  async get(drawId: string) { return this.artifacts.get(drawId) ?? null; }
}

