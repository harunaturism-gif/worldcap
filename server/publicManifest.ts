import { createHash } from 'node:crypto';
import type { DrawManifest, DrawRecord, PublicManifestEntry } from './drawTypes.js';

export const PUBLIC_DRAW_SCHEMA_VERSION = 'worldcap-public-draw-v3' as const;

export interface PublicDrawArtifact {
  schemaVersion: typeof PUBLIC_DRAW_SCHEMA_VERSION;
  algorithmVersion: string;
  drawId: string;
  drawKind: DrawRecord['kind'];
  prizePoolUnits: string;
  campaignId: string;
  scope: string;
  closedAt: string;
  eligibleCount: string;
  manifestRoot: string;
  artifactContentHash: string;
  entries: readonly PublicManifestEntry[];
}

function prefix(value: string): string { return `${Buffer.byteLength(value, 'utf8')}:${value}`; }

export function canonicalArtifactContent(input: Omit<PublicDrawArtifact, 'artifactContentHash'>): string {
  const fields = [
    'worldcap-public-artifact-content-v3', input.schemaVersion, input.algorithmVersion,
    input.drawId, input.drawKind, input.prizePoolUnits, input.campaignId, input.scope, input.closedAt, input.eligibleCount,
    input.manifestRoot, String(input.entries.length),
  ];
  for (const entry of input.entries) {
    fields.push(entry.index, entry.titleId, entry.serial, entry.tier, entry.campaignId);
  }
  return fields.map(prefix).join('|');
}

export function computeArtifactContentHash(input: Omit<PublicDrawArtifact, 'artifactContentHash'>): string {
  const canonical = canonicalArtifactContent(input);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function createPublicDrawArtifact(draw: DrawRecord, manifest: DrawManifest): PublicDrawArtifact {
  if (!draw.campaignId || !draw.finalizedAt || !draw.eligibilityCommitment || draw.eligibilityCommitment !== manifest.eligibilityCommitment) throw new Error('public_artifact_draw_not_finalized');
  const base = {
    schemaVersion: PUBLIC_DRAW_SCHEMA_VERSION,
    algorithmVersion: draw.algorithmVersion,
    drawId: draw.id,
    drawKind: draw.kind,
    prizePoolUnits: draw.prizePoolUnits.toString(),
    campaignId: draw.campaignId,
    scope: draw.eligibilityScope,
    closedAt: draw.finalizedAt,
    eligibleCount: draw.eligibleTitleCount.toString(),
    manifestRoot: draw.eligibilityCommitment,
  } as const;
  const entries = Object.freeze(manifest.entries.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({ ...base, artifactContentHash: computeArtifactContentHash({ ...base, entries }), entries });
}

export function serializePublicDrawArtifact(artifact: PublicDrawArtifact): string {
  return JSON.stringify({
    schemaVersion: artifact.schemaVersion, algorithmVersion: artifact.algorithmVersion,
    drawId: artifact.drawId, drawKind: artifact.drawKind, prizePoolUnits: artifact.prizePoolUnits, campaignId: artifact.campaignId, scope: artifact.scope,
    closedAt: artifact.closedAt, eligibleCount: artifact.eligibleCount,
    manifestRoot: artifact.manifestRoot, artifactContentHash: artifact.artifactContentHash,
    entries: artifact.entries.map((entry) => ({ index: entry.index, titleId: entry.titleId, serial: entry.serial, tier: entry.tier, campaignId: entry.campaignId })),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePublicDrawArtifact(value: unknown): PublicDrawArtifact {
  if (!isObject(value) || value.schemaVersion !== PUBLIC_DRAW_SCHEMA_VERSION || !Array.isArray(value.entries)) throw new Error('public_artifact_invalid');
  const required = ['algorithmVersion', 'drawId', 'drawKind', 'prizePoolUnits', 'campaignId', 'scope', 'closedAt', 'eligibleCount', 'manifestRoot', 'artifactContentHash'] as const;
  for (const field of required) if (typeof value[field] !== 'string') throw new Error('public_artifact_invalid');
  if (!['MONTHLY', 'QUARTERLY', 'ANNUAL_LEGACY'].includes(value.drawKind as string) || !/^(0|[1-9][0-9]*)$/.test(value.prizePoolUnits as string)) throw new Error('public_artifact_invalid');
  const entries = value.entries.map((item) => {
    if (!isObject(item)) throw new Error('public_artifact_invalid');
    for (const field of ['index', 'titleId', 'serial', 'tier', 'campaignId'] as const) if (typeof item[field] !== 'string') throw new Error('public_artifact_invalid');
    return Object.freeze({ index: item.index as string, titleId: item.titleId as string, serial: item.serial as string, tier: item.tier as string, campaignId: item.campaignId as string });
  });
  const artifact = Object.freeze({
    schemaVersion: PUBLIC_DRAW_SCHEMA_VERSION,
    algorithmVersion: value.algorithmVersion as string, drawId: value.drawId as string,
    drawKind: value.drawKind as DrawRecord['kind'], prizePoolUnits: value.prizePoolUnits as string,
    campaignId: value.campaignId as string, scope: value.scope as string, closedAt: value.closedAt as string,
    eligibleCount: value.eligibleCount as string, manifestRoot: value.manifestRoot as string,
    artifactContentHash: value.artifactContentHash as string, entries: Object.freeze(entries),
  });
  if (artifact.artifactContentHash !== computeArtifactContentHash(artifact)) throw new Error('public_artifact_hash_mismatch');
  return artifact;
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

