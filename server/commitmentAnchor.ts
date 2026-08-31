import { keccak256, stringToHex } from 'viem';

export interface DrawAnchor {
  drawIdHash: string;
  manifestRoot: string;
  eligibleCount: bigint;
  algorithmVersionHash: string;
  anchoredAtBlock: bigint;
}

export interface CommitmentAnchorReader {
  get(drawId: string): Promise<DrawAnchor | null>;
}

export function drawIdHash(drawId: string): string { return keccak256(stringToHex(drawId)); }
export function algorithmVersionHash(version: string): string { return keccak256(stringToHex(version)); }

export class MemoryCommitmentAnchor implements CommitmentAnchorReader {
  private readonly anchors = new Map<string, DrawAnchor>();
  anchor(drawId: string, manifestRoot: string, eligibleCount: bigint, algorithmVersion: string): DrawAnchor {
    if (this.anchors.has(drawId)) throw new Error('draw_anchor_immutable');
    if (!/^sha256:[0-9a-f]{64}$/.test(manifestRoot) || eligibleCount <= 0n) throw new Error('draw_anchor_invalid');
    const anchor = Object.freeze({ drawIdHash: drawIdHash(drawId), manifestRoot, eligibleCount, algorithmVersionHash: algorithmVersionHash(algorithmVersion), anchoredAtBlock: 1n });
    this.anchors.set(drawId, anchor);
    return anchor;
  }
  async get(drawId: string) { return this.anchors.get(drawId) ?? null; }
}
