import { createHash } from 'node:crypto';
import { DRAW_MANIFEST_VERSION, type DrawEligibilityCandidate, type DrawManifest, type PublicManifestEntry } from './drawTypes.js';

const HEX_64 = /^[0-9a-f]{64}$/;

function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

function leafHash(drawId: string, entry: PublicManifestEntry): Buffer {
  return sha256(JSON.stringify(['worldcap-manifest-leaf-v1', drawId, entry.index, entry.titleId, entry.serial, entry.tier, entry.campaignId]));
}

function compareAscii(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

export function computeManifestCommitment(drawId: string, entries: readonly PublicManifestEntry[]): string {
  if (!drawId || entries.length === 0) throw new Error('manifest_must_not_be_empty');
  let level = entries.map((entry) => leafHash(drawId, entry));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]!;
      const right = level[index + 1] ?? left;
      next.push(sha256(Buffer.concat([Buffer.from([1]), left, right])));
    }
    level = next;
  }
  return `sha256:${level[0]!.toString('hex')}`;
}

export function buildDrawManifest(drawId: string, candidates: readonly DrawEligibilityCandidate[], generatedAt: string): DrawManifest {
  if (!drawId || !Number.isFinite(Date.parse(generatedAt))) throw new Error('manifest_metadata_invalid');
  const ordered = [...candidates].sort((left, right) => compareAscii(left.serial, right.serial) || compareAscii(left.id, right.id));
  if (ordered.length === 0) throw new Error('draw_has_no_eligible_titles');
  if (new Set(ordered.map((title) => title.id)).size !== ordered.length) throw new Error('manifest_duplicate_title');
  const entries = ordered.map<PublicManifestEntry>((title, index) => Object.freeze({
    index: String(index), titleId: title.id, serial: title.serial, tier: title.tierCode.toUpperCase(), campaignId: title.campaignId,
  }));
  return Object.freeze({
    drawId,
    version: DRAW_MANIFEST_VERSION,
    generatedAt,
    eligibleCount: String(entries.length),
    eligibilityCommitment: computeManifestCommitment(drawId, entries),
    entries: Object.freeze(entries),
  });
}

export function isManifestCommitment(value: string): boolean {
  return value.startsWith('sha256:') && HEX_64.test(value.slice(7));
}
