import { computeManifestCommitment, isManifestCommitment } from './drawManifest.js';
import { parseRandomnessSeed, selectWinningIndex } from './drawSelection.js';
import { DRAW_ALGORITHM_VERSION, DRAW_MANIFEST_VERSION, type DrawManifest, type DrawRecord } from './drawTypes.js';

export interface DrawVerificationResult {
  verified: boolean;
  drawId: string;
  eligibleCount: string;
  winningIndex: string | null;
  winningTitle: string | null;
  winningTitleId: string | null;
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
  if (errors.length === 0 && draw.randomnessSeed) {
    winningIndex = selectWinningIndex(parseRandomnessSeed(draw.randomnessSeed), count);
    winningEntry = manifest.entries[Number(winningIndex)] ?? null;
    if (!winningEntry || draw.winningIndex !== winningIndex || draw.winningTitleId !== winningEntry.titleId) errors.push('winner_mismatch');
  }
  return {
    verified: errors.length === 0,
    drawId: draw.id,
    eligibleCount: count.toString(),
    winningIndex: winningIndex?.toString() ?? null,
    winningTitle: winningEntry?.serial ?? null,
    winningTitleId: winningEntry?.titleId ?? null,
    manifestRootMatches,
    algorithmVersion: draw.algorithmVersion,
    errors,
  };
}
