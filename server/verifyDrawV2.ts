import { computeArtifactContentHash, PUBLIC_DRAW_SCHEMA_VERSION, type PublicDrawArtifact } from './publicManifest.js';
import { computeManifestCommitment } from './drawManifest.js';
import { parseRandomnessSeed, selectWinningIndex } from './drawSelection.js';
import type { DrawRecord } from './drawTypes.js';
import { algorithmVersionHash } from './commitmentAnchor.js';

export interface AnchorEvidence {
  required: boolean;
  exists: boolean;
  drawId: string;
  manifestRoot: string | null;
  eligibleCount: string | null;
  algorithmVersionHash: string | null;
  verified: boolean;
}

export interface RandomnessEvidence {
  requestId: string | null;
  provider: string | null;
  network: string | null;
  independentlyVerified: boolean;
}

export interface DrawVerificationV2 {
  verified: boolean;
  manifestVerified: boolean;
  anchorRequired: boolean;
  anchorAvailable: boolean;
  anchorVerified: boolean;
  randomnessVerified: boolean;
  winnerVerified: boolean;
  algorithmVerified: boolean;
  winningIndex: string | null;
  winningTitle: string | null;
  errors: string[];
}

export function verifyDrawV2(input: { draw: DrawRecord; artifact: PublicDrawArtifact; randomness: RandomnessEvidence; anchor?: AnchorEvidence }): DrawVerificationV2 {
  const { draw, artifact, randomness, anchor } = input;
  const errors: string[] = [];
  const algorithmVerified = artifact.schemaVersion === PUBLIC_DRAW_SCHEMA_VERSION && artifact.algorithmVersion === 'worldcap-draw-v1' && draw.algorithmVersion === artifact.algorithmVersion;
  if (!algorithmVerified) errors.push('algorithm_not_supported');
  const expectedArtifactHash = computeArtifactContentHash(artifact);
  const expectedRoot = artifact.entries.length > 0 ? computeManifestCommitment(draw.id, artifact.entries) : null;
  const manifestVerified = artifact.drawId === draw.id
    && artifact.campaignId === draw.campaignId
    && artifact.eligibleCount === String(artifact.entries.length)
    && artifact.eligibleCount === draw.eligibleTitleCount.toString()
    && artifact.manifestRoot === expectedRoot
    && artifact.manifestRoot === draw.eligibilityCommitment
    && artifact.artifactContentHash === expectedArtifactHash;
  if (!manifestVerified) errors.push('manifest_verification_failed');
  const anchorRequired = anchor?.required ?? false;
  const anchorAvailable = anchor?.exists ?? false;
  const anchorVerified = Boolean(anchor?.exists && anchor.verified && anchor.drawId === draw.id
    && anchor.manifestRoot === artifact.manifestRoot && anchor.eligibleCount === artifact.eligibleCount
    && anchor.algorithmVersionHash?.toLowerCase() === algorithmVersionHash(artifact.algorithmVersion).toLowerCase());
  if (anchorRequired && !anchorVerified) errors.push('anchor_verification_failed');
  const randomnessVerified = Boolean(draw.randomnessSeed && draw.randomnessRequestId && randomness.independentlyVerified
    && randomness.requestId === draw.randomnessRequestId && randomness.provider === draw.randomnessProvider);
  if (!randomnessVerified) errors.push('randomness_verification_failed');
  let winningIndex: bigint | null = null;
  let winner = null;
  if (algorithmVerified && manifestVerified && draw.randomnessSeed) {
    winningIndex = selectWinningIndex(parseRandomnessSeed(draw.randomnessSeed), BigInt(artifact.entries.length));
    winner = artifact.entries[Number(winningIndex)] ?? null;
  }
  const winnerVerified = Boolean(winner && winningIndex === draw.winningIndex && winner.titleId === draw.winningTitleId);
  if (!winnerVerified) errors.push('winner_verification_failed');
  return { verified: errors.length === 0, manifestVerified, anchorRequired, anchorAvailable, anchorVerified, randomnessVerified, winnerVerified, algorithmVerified, winningIndex: winningIndex?.toString() ?? null, winningTitle: winner?.serial ?? null, errors };
}
