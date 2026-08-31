import type { TitleLifecycleState, TitleTierCode } from './economyTypes.js';

export const DRAW_ALGORITHM_VERSION = 'worldcap-draw-v1' as const;
export const DRAW_MANIFEST_VERSION = 'worldcap-manifest-v1' as const;

export type DrawStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'RANDOMNESS_PENDING' | 'RESOLVED' | 'SETTLED';
export type DrawEligibilityScope = 'GLOBAL' | 'ACCESSIBLE' | 'PURPLE' | 'GOLD' | 'SPECIAL';
export type DrawPayoutStatus = 'NOT_READY' | 'PENDING' | 'SETTLED';

export interface DrawRecord {
  id: string;
  campaignId: string | null;
  eligibilityScope: DrawEligibilityScope;
  allowedTierCodes: readonly string[];
  opensAt: string;
  closesAt: string;
  status: DrawStatus;
  eligibleTitleCount: bigint;
  eligibilityCommitment: string | null;
  manifestVersion: typeof DRAW_MANIFEST_VERSION;
  algorithmVersion: typeof DRAW_ALGORITHM_VERSION;
  randomnessProvider: string | null;
  randomnessRequestId: string | null;
  randomnessSeed: string | null;
  winningIndex: bigint | null;
  winningTitleId: string | null;
  finalizedAt: string | null;
  payoutStatus: DrawPayoutStatus;
}

export interface DrawEligibilityCandidate {
  id: string;
  serial: string;
  campaignId: string;
  tierCode: TitleTierCode | 'special';
  currentOwnerId: string;
  issuedAt: string;
  drawEligible: boolean;
  lifecycleState: TitleLifecycleState;
  scratchStatus: 'available' | 'revealed';
}

export interface PublicManifestEntry {
  index: string;
  titleId: string;
  serial: string;
  tier: string;
  campaignId: string;
}

export interface DrawManifest {
  drawId: string;
  version: typeof DRAW_MANIFEST_VERSION;
  generatedAt: string;
  eligibleCount: string;
  eligibilityCommitment: string;
  entries: readonly PublicManifestEntry[];
}

export interface DrawFairnessResponse {
  drawId: string;
  status: DrawStatus;
  eligibilityScope: DrawEligibilityScope;
  allowedTierCodes: readonly string[];
  eligibleCount: string;
  snapshotCommitment: string | null;
  manifestVersion: string;
  randomnessProvider: string | null;
  randomnessRequestId: string | null;
  randomnessSeed: string | null;
  algorithmVersion: string;
  winningIndex: string | null;
  winningTitle: string | null;
  verificationStatus: 'NOT_READY' | 'PENDING' | 'VERIFIED' | 'FAILED';
  payoutStatus: DrawPayoutStatus;
}
