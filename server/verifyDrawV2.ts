import { computeArtifactContentHash, PUBLIC_DRAW_SCHEMA_VERSION, type PublicDrawArtifact } from './publicManifest.js';
import { computeManifestCommitment } from './drawManifest.js';
import { parseRandomnessSeed } from './drawSelection.js';
import type { DrawRecord } from './drawTypes.js';
import { algorithmVersionHash } from './commitmentAnchor.js';
import { resolveOrderedWinners } from './economicsV1.js';
import { DRAW_ALGORITHM_VERSION } from './drawTypes.js';

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
  winners: readonly {
    ordinal: number;
    winningIndex: string;
    winningTitle: string;
    payoutBasisPoints: number;
    payoutUnits: string;
  }[];
  errors: string[];
}

export function verifyDrawV2(input: { draw: DrawRecord; artifact: PublicDrawArtifact; randomness: RandomnessEvidence; anchor?: AnchorEvidence }): DrawVerificationV2 {
  const { draw, artifact, randomness, anchor } = input;
  const errors: string[] = [];
  const algorithmVerified = artifact.schemaVersion === PUBLIC_DRAW_SCHEMA_VERSION && artifact.algorithmVersion === DRAW_ALGORITHM_VERSION && draw.algorithmVersion === artifact.algorithmVersion;
  if (!algorithmVerified) errors.push('algorithm_not_supported');
  const expectedArtifactHash = computeArtifactContentHash(artifact);
  const expectedRoot = artifact.entries.length > 0 ? computeManifestCommitment(draw.id, artifact.entries) : null;
  const manifestVerified = artifact.drawId === draw.id
    && artifact.drawKind === draw.kind
    && artifact.prizePoolUnits === draw.prizePoolUnits.toString()
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
  let winners: DrawVerificationV2['winners'] = [];
  if (algorithmVerified && manifestVerified && draw.randomnessSeed) {
    const resolved = resolveOrderedWinners({ drawId: draw.id, drawKind: draw.kind, randomnessSeed: parseRandomnessSeed(draw.randomnessSeed), entries: artifact.entries, prizePoolUnits: draw.prizePoolUnits });
    winners = resolved.map((item) => ({ ordinal: item.ordinal, winningIndex: item.winningIndex.toString(), winningTitle: artifact.entries[Number(item.winningIndex)]?.serial ?? '', payoutBasisPoints: item.payoutBasisPoints, payoutUnits: item.payoutUnits.toString() }));
    winningIndex = resolved[0]?.winningIndex ?? null;
    winner = winningIndex === null ? null : artifact.entries[Number(winningIndex)] ?? null;
  }
  const recomputed = winners.length === draw.winners.length && draw.winners.every((stored, index) => {
    const calculated = winners[index];
    return calculated?.ordinal === stored.ordinal && calculated.winningIndex === stored.winningIndex.toString()
      && artifact.entries[Number(stored.winningIndex)]?.titleId === stored.winningTitleId
      && calculated.payoutBasisPoints === stored.payoutBasisPoints && calculated.payoutUnits === stored.payoutUnits.toString();
  });
  const winnerVerified = Boolean(winner && winningIndex === draw.winningIndex && winner.titleId === draw.winningTitleId && recomputed);
  if (!winnerVerified) errors.push('winner_verification_failed');
  return { verified: errors.length === 0, manifestVerified, anchorRequired, anchorAvailable, anchorVerified, randomnessVerified, winnerVerified, algorithmVerified, winningIndex: winningIndex?.toString() ?? null, winningTitle: winner?.serial ?? null, winners, errors };
}
