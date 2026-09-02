import type { InternalUser } from './appSession.js';

export type CapAccountingSource = 'TITLE_ENTITLEMENT' | 'HUMAN_CLAIM' | 'GENESIS_GROWTH' | 'OTHER_FUTURE';
export type HumanClaimEpochStatus = 'DRAFT' | 'PUBLISHED' | 'OPEN' | 'CLOSED' | 'FINALIZED';
export type HumanClaimParticipationStatus = 'NOT_CLAIMED' | 'REGISTERED' | 'SETTLED';
export type GrowthCampaignStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';
export type QuestKind = 'FIRST_SOCIAL_POST' | 'VERIFIED_PROFILE' | 'VERIFIED_REFERRAL' | 'TITLE_COUNT_MILESTONE' | 'FIRST_COSMETIC_PURCHASE_REBATE' | 'FOLLOW_INSTAGRAM' | 'FOLLOW_X';
export type QuestVerificationMode = 'INTERNAL' | 'EXTERNAL';
export type QuestProgressStatus = 'LOCKED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'QUALIFIED' | 'CLAIMED' | 'UNAVAILABLE';

export interface CapSourceTotals {
  titleEntitlementUnits: bigint;
  humanClaimUnits: bigint;
  genesisGrowthUnits: bigint;
  otherFutureUnits: bigint;
  availableUnits: bigint;
  lockedUnits: bigint;
  spentUnits: bigint;
  burnedUnits: bigint;
  totalClaimedUnits: bigint;
  accountingMode: 'simulated';
}

export interface HumanClaimEpoch {
  id: string;
  calendarPeriod: string;
  status: HumanClaimEpochStatus;
  poolUnits: bigint;
  opensAt: string;
  closesAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  finalizedAt: string | null;
  participantCount: bigint;
  settledUnitsPerHuman: bigint | null;
  unissuedRemainderUnits: bigint | null;
  accountingMode: 'simulated';
}

export interface HumanClaimParticipation {
  id: string;
  epochId: string;
  userId: string;
  status: Exclude<HumanClaimParticipationStatus, 'NOT_CLAIMED'>;
  registeredAt: string;
  settledAt: string | null;
  settledUnits: bigint;
}

export interface HumanClaimView {
  available: boolean;
  reason: string | null;
  epoch: Omit<HumanClaimEpoch, 'accountingMode'> | null;
  participation: HumanClaimParticipationStatus;
  settledUnits: bigint;
  estimatedUnits: bigint | null;
  estimateLabel: 'ESTIMATE' | null;
}

export interface GrowthCampaign {
  id: string;
  version: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: GrowthCampaignStatus;
  budgetUnits: bigint;
  publishedAt: string | null;
  configCommitment: `sha256:${string}`;
  distributedUnits: bigint;
  reservedUnits: bigint;
  accountingMode: 'simulated';
}

export interface GrowthQuest {
  id: string;
  campaignId: string;
  code: string;
  kind: QuestKind;
  verificationMode: QuestVerificationMode;
  rewardUnits: bigint;
  maxRewardedCompletions: bigint | null;
  milestoneThreshold: bigint | null;
  config: Readonly<Record<string, string | number | boolean>>;
  status: 'PUBLISHED' | 'ACTIVE' | 'CLOSED';
}

export interface QuestJourneyItem {
  questId: string;
  code: string;
  kind: QuestKind;
  verificationMode: QuestVerificationMode;
  rewardUnits: bigint;
  status: QuestProgressStatus;
  progressCurrent: bigint;
  progressRequired: bigint;
  reason: string | null;
}

export interface CapDistribution {
  id: string;
  source: CapAccountingSource;
  campaignId: string | null;
  questId: string | null;
  userId: string;
  amountUnits: bigint;
  reason: string;
  reference: string;
  createdAt: string;
  accountingMode: 'simulated';
}

export interface GenesisJourney {
  campaign: (GrowthCampaign & { remainingUnits: bigint }) | null;
  quests: QuestJourneyItem[];
  humanClaim: HumanClaimView;
  cap: CapSourceTotals;
  referralCode: string;
}

export interface FounderControlMetrics {
  generatedAt: string;
  humanClaim: {
    period: string | null;
    poolUnits: bigint;
    participants: bigint;
    settledUnits: bigint;
    settledUnitsPerHuman: bigint;
    unissuedUnits: bigint;
    previousPeriodParticipants: bigint;
    participantGrowthBps: bigint | null;
    projectedShare2x: bigint;
    projectedShare5x: bigint;
    projectedShare10x: bigint;
  };
  product: {
    users: bigint;
    verifiedHumans: bigint;
    titlesIssued: bigint;
    settledPurchases: bigint;
    activeCampaignId: string | null;
    monthlyDrawStatus: string | null;
    quarterlyDrawStatus: string | null;
  };
  genesis: {
    campaignId: string | null;
    budgetUnits: bigint;
    distributedUnits: bigint;
    reservedUnits: bigint;
    remainingUnits: bigint;
    participants: bigint;
    byQuest: Array<{ questId: string; qualified: bigint; claimed: bigint; distributedUnits: bigint }>;
    verifiedReferrals: bigint;
    milestoneQualifications: bigint;
    externalPending: bigint;
  };
  cap: CapSourceTotals;
  trust: {
    immutableLedgerRows: bigint;
    accountingMode: 'simulated';
    productionTokenTransfers: false;
    latestDrawId: string | null;
    manifestCommitment: string | null;
    randomnessStatus: string;
    externalProofStatus: string;
    anchorStatus: string;
    verifyDrawStatus: string;
  };
  operations: {
    reconciliationPending: bigint;
    reconciliationFailedOrStuck: bigint;
    drawJobsFailed: bigint;
    readinessStatus: string;
  };
}

export interface PublicCapFairnessSummary {
  generatedAt: string;
  accountingMode: 'simulated';
  sources: Pick<CapSourceTotals, 'titleEntitlementUnits' | 'humanClaimUnits' | 'genesisGrowthUnits' | 'otherFutureUnits' | 'lockedUnits' | 'burnedUnits' | 'totalClaimedUnits'>;
  humanClaim: { calendarPeriod: string | null; status: HumanClaimEpochStatus | null; poolUnits: bigint; participantCount: bigint; settledUnitsPerHuman: bigint | null; unissuedRemainderUnits: bigint | null };
  genesis: { campaignId: string | null; version: string | null; budgetUnits: bigint; distributedUnits: bigint; remainingUnits: bigint };
}

export interface ExternalQuestVerificationProvider {
  verify(input: { user: InternalUser; quest: GrowthQuest }): Promise<{ verified: boolean; reference: string }>;
}

export interface GenesisCapRepository {
  getJourney(user: InternalUser, now: Date): Promise<GenesisJourney>;
  registerMonthlyClaim(user: InternalUser, now: Date): Promise<{ participation: HumanClaimParticipation; replayed: boolean }>;
  finalizeMonthlyClaim(epochId: string, now: Date): Promise<{ epoch: HumanClaimEpoch; replayed: boolean; settlements: CapDistribution[] }>;
  evaluateQuest(user: InternalUser, questId: string, now: Date): Promise<QuestJourneyItem>;
  claimQuestReward(user: InternalUser, questId: string, now: Date): Promise<{ distribution: CapDistribution; replayed: boolean }>;
  registerReferral(user: InternalUser, inviterCode: string, now: Date): Promise<{ referralId: string; replayed: boolean }>;
  createSocialPost(user: InternalUser, body: string, now: Date): Promise<{ id: string; body: string; createdAt: string }>;
  getFounderMetrics(now: Date): Promise<FounderControlMetrics>;
  getPublicSummary(now: Date): Promise<PublicCapFairnessSummary>;
}
