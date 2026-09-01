import { computeManifestCommitment, isManifestCommitment } from './drawManifest.js';
import { parseRandomnessSeed } from './drawSelection.js';
import { DRAW_ALGORITHM_VERSION, DRAW_MANIFEST_VERSION, type DrawManifest, type DrawRecord } from './drawTypes.js';
import { resolveOrderedWinners } from './economicsV1.js';

export interface DrawVerificationResult {
  verified: boolean;
  drawId: string;
  eligibleCount: string;
  winningIndex: string | null;
  winningTitle: string | null;
  winningTitleId: string | null;
  winners: readonly {
    ordinal: number;
    winningIndex: string;
    winningTitle: string;
    payoutBasisPoints: number;
    payoutUnits: string;
  }[];
  manifestRootMatches: boolean;
  algorithmVersion: string;
  errors: string[];
}

export function verifyDraw(draw: DrawRecord, manifest: DrawManifest): DrawVerificationResult {
  const errors: string[] = [];
  const count = BigInt(manifest.entries.length);
  const recomputedCommitment = manifest.entries.length > 0 ? computeManifestCommitment(draw.id, manifest.entries) : null;
  const manifestRootMatches = Boolean(
    recomputedCommitment
    && isManifestCommitment(manifest.eligibilityCommitment)
    && manifest.eligibilityCommitment === recomputedCommitment
    && draw.eligibilityCommitment === recomputedCommitment,
  );
  if (manifest.drawId !== draw.id) errors.push('draw_id_mismatch');
  if (manifest.version !== DRAW_MANIFEST_VERSION || draw.manifestVersion !== DRAW_MANIFEST_VERSION) errors.push('manifest_version_mismatch');
  if (draw.algorithmVersion !== DRAW_ALGORITHM_VERSION) errors.push('algorithm_version_unsupported');
  if (manifest.eligibleCount !== count.toString() || draw.eligibleTitleCount !== count) errors.push('eligible_count_mismatch');
  if (!manifestRootMatches) errors.push('manifest_commitment_mismatch');
  if (!draw.randomnessSeed) errors.push('randomness_not_available');

  let winningIndex: bigint | null = null;
  let winningEntry = null;
  let winners: DrawVerificationResult['winners'] = [];
  if (errors.length === 0 && draw.randomnessSeed) {
    const resolved = resolveOrderedWinners({ drawId: draw.id, drawKind: draw.kind, randomnessSeed: parseRandomnessSeed(draw.randomnessSeed), entries: manifest.entries, prizePoolUnits: draw.prizePoolUnits });
    winners = resolved.map((winner) => {
      const entry = manifest.entries[Number(winner.winningIndex)];
      return { ordinal: winner.ordinal, winningIndex: winner.winningIndex.toString(), winningTitle: entry?.serial ?? '', payoutBasisPoints: winner.payoutBasisPoints, payoutUnits: winner.payoutUnits.toString() };
    });
    const first = resolved[0] ?? null;
    winningIndex = first?.winningIndex ?? null;
    winningEntry = winningIndex === null ? null : manifest.entries[Number(winningIndex)] ?? null;
    const storedMatches = resolved.length === draw.winners.length && resolved.every((winner, index) => {
      const stored = draw.winners[index];
      return stored?.ordinal === winner.ordinal && stored.winningIndex === winner.winningIndex && stored.winningTitleId === winner.titleId
        && stored.payoutBasisPoints === winner.payoutBasisPoints && stored.payoutUnits === winner.payoutUnits;
    });
    if (!winningEntry || draw.winningIndex !== winningIndex || draw.winningTitleId !== winningEntry.titleId || !storedMatches) errors.push('winner_mismatch');
  }
  return {
    verified: errors.length === 0,
    drawId: draw.id,
    eligibleCount: count.toString(),
    winningIndex: winningIndex?.toString() ?? null,
    winningTitle: winningEntry?.serial ?? null,
    winningTitleId: winningEntry?.titleId ?? null,
    winners,
    manifestRootMatches,
    algorithmVersion: draw.algorithmVersion,
    errors,
  };
}
