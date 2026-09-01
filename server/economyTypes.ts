import type { InternalUser } from './appSession.js';

export const ACTIVE_CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
export const ACCESSIBLE_TIER_ID = '22222222-2222-4222-8222-222222222222';
export const PURPLE_TIER_ID = '33333333-3333-4333-8333-333333333333';
export const GOLD_TIER_ID = '44444444-4444-4444-8444-444444444444';
export const TITLE_PRICE_UNITS = 5_000_000_000_000_000_000n; // Purple default retained for compatibility.
export const MAX_TITLES_PER_PURCHASE = 10;

export type PaymentMode = 'real' | 'development-fake' | 'beta-demo' | 'disabled';
export const ECONOMIC_MODEL_VERSION = 'worldcap-40-38-10-10-2-v1' as const;
export const LEGACY_ECONOMIC_MODEL_VERSION = 'legacy-60-10-20-10' as const;
export type EconomicModelVersion = typeof ECONOMIC_MODEL_VERSION | typeof LEGACY_ECONOMIC_MODEL_VERSION;
export type AllocationBucket = 'cap_redemption_program' | 'monthly_prize_pool' | 'quarterly_jackpot' | 'company_treasury' | 'platform_operations' | 'annual_jackpot' | 'commercial_growth';
export type TitleTierCode = 'accessible' | 'purple' | 'gold';
export type TitleLifecycleState = 'active' | 'draw_period_complete' | 'archived' | 'eligible_for_renewal';
export type TitleRenewalState = 'not_eligible' | 'eligible' | 'redeemed' | 'expired';
export interface ScratchTierConfig { upperBoundBasisPoints: number; prizeUnits: bigint }

export const DEFAULT_SCRATCH_TIERS: ScratchTierConfig[] = [
  { upperBoundBasisPoints: 300, prizeUnits: 20_000_000_000_000_000_000n },
  { upperBoundBasisPoints: 1_200, prizeUnits: 5_000_000_000_000_000_000n },
  { upperBoundBasisPoints: 3_200, prizeUnits: 1_000_000_000_000_000_000n },
  { upperBoundBasisPoints: 10_000, prizeUnits: 0n },
];

export interface TitleTierRecord {
  id: string;
  campaignId: string;
  code: TitleTierCode;
  name: string;
  priceUnits: bigint;
  skin: TitleTierCode;
  status: 'active';
  sortOrder: number;
  scratchTiers: ScratchTierConfig[];
}

export interface CampaignRecord {
  id: string;
  name: string;
  monthLabel: string;
  status: 'active';
  titlePriceUnits: bigint;
  serialPrefix: string;
  monthlyDrawAt: string;
  quarterlyDrawAt: string;
  annualDrawAt?: string;
}

export interface PurchaseIntentRecord {
  reference: string;
  userId: string;
  campaignId: string;
  tierId: string;
  quantity: number;
  unitPriceUnits: bigint;
  totalUnits: bigint;
  recipient: string;
  token: 'WLD';
  status: 'pending' | 'completed' | 'expired';
  expiresAt: string;
  createdAt: string;
  completedPurchaseId: string | null;
  transactionId: string | null;
  economicModelVersion: EconomicModelVersion;
}

export interface VerifiedPayment {
  transactionId: string;
  transactionHash: string;
  reference: string;
  transactionStatus: 'mined';
  from: string;
  chain: 'worldchain';
  tokenAmount: string;
  token: 'WLD';
  to: string;
  appId: string;
  timestamp: string;
  settlementMode?: 'verified' | 'demo';
}

export interface PurchaseRecord {
  id: string;
  reference: string;
  userId: string;
  campaignId: string;
  tierId: string;
  quantity: number;
  unitPriceUnits: bigint;
  totalUnits: bigint;
  transactionId: string;
  transactionHash: string;
  payerAddress: string;
  createdAt: string;
  settlementMode: 'verified' | 'demo';
  economicModelVersion: EconomicModelVersion;
}

export interface TitleRecord {
  id: string;
  serial: string;
  campaignId: string;
  tierId: string;
  tierCode: TitleTierCode;
  tierName: string;
  purchaseId: string;
  ownerId: string;
  originalBuyerId: string;
  currentOwnerId: string;
  createdAt: string;
  scratchStatus: 'available' | 'revealed';
  scratchResultId: string | null;
  drawEligible: true;
  lifecycleState: TitleLifecycleState;
  renewalState: TitleRenewalState;
  futureRedemptionState: 'not_configured';
  capRedemptionState: 'locked' | 'available' | 'claimed' | 'expired';
  capEntitlementUnits: bigint;
}

export interface OwnershipEventRecord {
  id: string;
  titleId: string;
  eventType: 'issued';
  fromUserId: null;
  toUserId: string;
  purchaseId: string;
  createdAt: string;
}

export interface AllocationRecord {
  id: string;
  purchaseId: string;
  bucket: AllocationBucket;
  percentage: 60 | 40 | 38 | 20 | 10 | 2;
  amountUnits: bigint;
}

export interface LedgerRecord {
  id: string;
  userId: string;
  classification: 'verified_purchase' | 'demo_purchase' | 'simulated_scratch_prize' | 'simulated_draw_prize';
  direction: 'debit' | 'credit';
  amountUnits: bigint;
  spendable: boolean;
  referenceId: string;
  description: string;
  createdAt: string;
}

export interface ScratchResultRecord {
  id: string;
  titleId: string;
  userId: string;
  prizeUnits: bigint;
  simulated: true;
  provider: string;
  randomnessReference: string;
  revealedAt: string;
}

export interface ActivityRecord {
  id: string;
  type: 'purchase_activity' | 'winner_activity' | 'jackpot_milestone';
  body: string;
  createdAt: string;
}

export interface EconomySnapshotRecord {
  campaign: CampaignRecord;
  titleTiers: TitleTierRecord[];
  titlesSold: number;
  purchases: PurchaseRecord[];
  titles: TitleRecord[];
  ledger: LedgerRecord[];
  allocations: AllocationRecord[];
  scratchResults: ScratchResultRecord[];
  activity: ActivityRecord[];
  ownershipEvents: OwnershipEventRecord[];
  walletAddress: string | null;
}

export interface PurchaseCompletion {
  purchase: PurchaseRecord;
  titles: TitleRecord[];
  replayed: boolean;
}

export interface ScratchCompletion {
  title: TitleRecord;
  result: ScratchResultRecord;
  replayed: boolean;
}

export interface CapRedemptionCompletion {
  titleId: string;
  claimedUnits: bigint;
  drawEligible: true;
  replayed: boolean;
}

export interface AuthenticatedRequestContext { user: InternalUser }
