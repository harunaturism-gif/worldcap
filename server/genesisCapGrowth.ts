import { createHash, randomUUID } from 'node:crypto';
import type { InternalUser } from './appSession.js';
import type {
  CapDistribution, CapSourceTotals, ExternalQuestVerificationProvider, FounderControlMetrics, GenesisCapRepository,
  GenesisJourney, GrowthCampaign, GrowthCampaignStatus, GrowthQuest, HumanClaimEpoch, HumanClaimEpochStatus,
  HumanClaimParticipation, PublicCapFairnessSummary, QuestJourneyItem,
} from './genesisCapTypes.js';

const PERIOD_PATTERN = /^(20[0-9]{2})-(0[1-9]|1[0-2])$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function clone<T>(value: T): T { return structuredClone(value); }
function iso(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('time_invalid');
  return now.toISOString();
}
function requireUnits(value: bigint, name: string, allowZero = true): void {
  if (value < 0n || (!allowZero && value === 0n)) throw new Error(`${name}_invalid`);
}
function periodBounds(period: string): { opensAt: string; closesAt: string } {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) throw new Error('calendar_period_invalid');
  const year = Number(match[1]); const month = Number(match[2]);
  return {
    opensAt: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    closesAt: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

export function calendarPeriodUtc(now: Date): string {
  iso(now);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createMonthlyHumanClaimEpoch(input: { id: string; calendarPeriod: string; poolUnits: bigint }): HumanClaimEpoch {
  if (!input.id.trim()) throw new Error('human_claim_epoch_id_required');
  requireUnits(input.poolUnits, 'human_claim_pool', false);
  const bounds = periodBounds(input.calendarPeriod);
  return Object.freeze({
    id: input.id, calendarPeriod: input.calendarPeriod, status: 'DRAFT', poolUnits: input.poolUnits,
    ...bounds, publishedAt: null, closedAt: null, finalizedAt: null, participantCount: 0n,
    settledUnitsPerHuman: null, unissuedRemainderUnits: null, accountingMode: 'simulated',
  });
}

const EPOCH_TRANSITIONS: Record<HumanClaimEpochStatus, readonly HumanClaimEpochStatus[]> = {
  DRAFT: ['PUBLISHED'], PUBLISHED: ['OPEN'], OPEN: ['CLOSED'], CLOSED: ['FINALIZED'], FINALIZED: [],
};

export function transitionMonthlyHumanClaimEpoch(epoch: HumanClaimEpoch, status: HumanClaimEpochStatus, now: Date): HumanClaimEpoch {
  if (!EPOCH_TRANSITIONS[epoch.status].includes(status)) throw new Error('human_claim_epoch_transition_invalid');
  const timestamp = iso(now);
  if (status === 'PUBLISHED' && now.getTime() > new Date(epoch.opensAt).getTime()) throw new Error('human_claim_publish_after_open');
  if (status === 'OPEN' && (now.getTime() < new Date(epoch.opensAt).getTime() || now.getTime() >= new Date(epoch.closesAt).getTime())) throw new Error('human_claim_open_time_invalid');
  if (status === 'CLOSED' && now.getTime() < new Date(epoch.closesAt).getTime()) throw new Error('human_claim_close_early');
  return Object.freeze({ ...epoch, status, publishedAt: status === 'PUBLISHED' ? timestamp : epoch.publishedAt, closedAt: status === 'CLOSED' ? timestamp : epoch.closedAt });
}

export function computeMonthlyHumanClaimSettlement(poolUnits: bigint, participantCount: bigint): { unitsPerHuman: bigint; unissuedRemainderUnits: bigint } {
  requireUnits(poolUnits, 'human_claim_pool', false);
  requireUnits(participantCount, 'human_claim_participant_count');
  if (participantCount === 0n) return { unitsPerHuman: 0n, unissuedRemainderUnits: poolUnits };
  const unitsPerHuman = poolUnits / participantCount;
  return { unitsPerHuman, unissuedRemainderUnits: poolUnits - unitsPerHuman * participantCount };
}

function canonicalConfig(config: Readonly<Record<string, string | number | boolean>>): string {
  return JSON.stringify(Object.entries(config).sort(([a], [b]) => a.localeCompare(b)));
}

export function computeGrowthCampaignCommitment(input: Pick<GrowthCampaign, 'id' | 'version' | 'name' | 'startsAt' | 'endsAt' | 'budgetUnits'>, quests: readonly GrowthQuest[]): `sha256:${string}` {
  const questConfig = [...quests].sort((a, b) => a.code.localeCompare(b.code)).map((quest) => [
    quest.id, quest.code, quest.kind, quest.verificationMode, quest.rewardUnits.toString(),
    quest.maxRewardedCompletions?.toString() ?? '', quest.milestoneThreshold?.toString() ?? '', canonicalConfig(quest.config),
  ].join('|')).join('\n');
  const canonical = ['genesis-growth-v1', input.id, input.version, input.name, input.startsAt, input.endsAt, input.budgetUnits.toString(), questConfig].join('\n');
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export function validateGrowthCampaign(campaign: GrowthCampaign, quests: readonly GrowthQuest[]): void {
  if (!campaign.id.trim() || !campaign.name.trim() || !VERSION_PATTERN.test(campaign.version)) throw new Error('growth_campaign_invalid');
  requireUnits(campaign.budgetUnits, 'growth_campaign_budget', false);
  requireUnits(campaign.distributedUnits, 'growth_campaign_distributed');
  requireUnits(campaign.reservedUnits, 'growth_campaign_reserved');
  if (new Date(campaign.startsAt).getTime() >= new Date(campaign.endsAt).getTime()) throw new Error('growth_campaign_time_invalid');
  if (campaign.distributedUnits + campaign.reservedUnits > campaign.budgetUnits) throw new Error('growth_campaign_budget_exceeded');
  const codes = new Set<string>();
  for (const quest of quests) {
    if (quest.campaignId !== campaign.id || !CODE_PATTERN.test(quest.code) || quest.rewardUnits <= 0n || codes.has(quest.code)) throw new Error('growth_quest_invalid');
    if ((quest.verificationMode === 'EXTERNAL') !== (quest.kind === 'FOLLOW_INSTAGRAM' || quest.kind === 'FOLLOW_X')) throw new Error('growth_quest_verification_mode_invalid');
    if (quest.kind === 'TITLE_COUNT_MILESTONE' && (!quest.milestoneThreshold || quest.milestoneThreshold <= 0n)) throw new Error('growth_milestone_threshold_required');
    codes.add(quest.code);
  }
  const expected = computeGrowthCampaignCommitment(campaign, quests);
  if (campaign.status !== 'DRAFT' && campaign.configCommitment !== expected) throw new Error('growth_campaign_commitment_mismatch');
}

const CAMPAIGN_TRANSITIONS: Record<GrowthCampaignStatus, readonly GrowthCampaignStatus[]> = {
  DRAFT: ['PUBLISHED'], PUBLISHED: ['ACTIVE'], ACTIVE: ['CLOSED'], CLOSED: [],
};

export function transitionGrowthCampaign(campaign: GrowthCampaign, quests: readonly GrowthQuest[], status: GrowthCampaignStatus, now: Date): GrowthCampaign {
  if (!CAMPAIGN_TRANSITIONS[campaign.status].includes(status)) throw new Error('growth_campaign_transition_invalid');
  validateGrowthCampaign(campaign, quests);
  const timestamp = iso(now);
  if (status === 'PUBLISHED' && now.getTime() > new Date(campaign.startsAt).getTime()) throw new Error('growth_campaign_publish_after_start');
  if (status === 'ACTIVE' && (now.getTime() < new Date(campaign.startsAt).getTime() || now.getTime() >= new Date(campaign.endsAt).getTime())) throw new Error('growth_campaign_activation_time_invalid');
  if (status === 'CLOSED' && now.getTime() < new Date(campaign.endsAt).getTime()) throw new Error('growth_campaign_close_early');
  const commitment = status === 'PUBLISHED' ? computeGrowthCampaignCommitment(campaign, quests) : campaign.configCommitment;
  return Object.freeze({ ...campaign, status, configCommitment: commitment, publishedAt: status === 'PUBLISHED' ? timestamp : campaign.publishedAt });
}

export interface DevelopmentGenesisConfig {
  epochs?: readonly HumanClaimEpoch[];
  campaigns?: readonly GrowthCampaign[];
  quests?: readonly GrowthQuest[];
  externalVerifier?: ExternalQuestVerificationProvider;
  titleAccounting?: (userId: string) => Promise<{ lockedUnits: bigint; availableUnits: bigint; claimedUnits: bigint }>;
}

export function createLocalClosedBetaGenesisConfig(now = new Date()): DevelopmentGenesisConfig {
  const month = now.toISOString().slice(0, 7);
  const opensAt = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const closesAt = new Date(now.getTime() + 21 * 86_400_000).toISOString();
  const campaignId = 'local-cap-genesis-2026';
  return {
    epochs: [{ id: `local-human-claim-${month}`, calendarPeriod: month, status: 'OPEN', poolUnits: 1_000_003n, opensAt, closesAt, publishedAt: opensAt, closedAt: null, finalizedAt: null, participantCount: 24n, settledUnitsPerHuman: null, unissuedRemainderUnits: null, accountingMode: 'simulated' }],
    campaigns: [{ id: campaignId, version: 'local-beta-v1', name: 'CAP Genesis Journey · Local Beta', startsAt: opensAt, endsAt: closesAt, status: 'ACTIVE', budgetUnits: 250_000n, publishedAt: opensAt, configCommitment: `sha256:${'c'.repeat(64)}`, distributedUnits: 18_500n, reservedUnits: 2_500n, accountingMode: 'simulated' }],
    quests: [
      { id: 'local-quest-profile', campaignId, code: 'VERIFIED_PROFILE', kind: 'VERIFIED_PROFILE', verificationMode: 'INTERNAL', rewardUnits: 1_000n, maxRewardedCompletions: 10_000n, milestoneThreshold: null, config: {}, status: 'ACTIVE' },
      { id: 'local-quest-social', campaignId, code: 'FIRST_SOCIAL_POST', kind: 'FIRST_SOCIAL_POST', verificationMode: 'INTERNAL', rewardUnits: 750n, maxRewardedCompletions: 10_000n, milestoneThreshold: null, config: {}, status: 'ACTIVE' },
      { id: 'local-quest-collector', campaignId, code: 'TITLE_COUNT_MILESTONE', kind: 'TITLE_COUNT_MILESTONE', verificationMode: 'INTERNAL', rewardUnits: 2_500n, maxRewardedCompletions: 5_000n, milestoneThreshold: 5n, config: {}, status: 'ACTIVE' },
      { id: 'local-quest-x', campaignId, code: 'FOLLOW_X', kind: 'FOLLOW_X', verificationMode: 'EXTERNAL', rewardUnits: 500n, maxRewardedCompletions: 20_000n, milestoneThreshold: null, config: { provider: 'not-connected-local-beta' }, status: 'ACTIVE' },
    ],
  };
}

interface ProgressRecord { status: QuestJourneyItem['status']; reference: string | null; qualifiedAt: string | null }
interface ReferralRecord { id: string; inviterId: string; refereeId: string; createdAt: string; qualifiedAt: string | null }
class AsyncMutex {
  private tail = Promise.resolve();
  async run<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.tail; let release = () => {};
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous; try { return await operation(); } finally { release(); }
  }
}

export class DevelopmentMemoryGenesisCapRepository implements GenesisCapRepository {
  readonly epochs = new Map<string, HumanClaimEpoch>();
  readonly participations = new Map<string, HumanClaimParticipation>();
  readonly campaigns = new Map<string, GrowthCampaign>();
  readonly quests = new Map<string, GrowthQuest>();
  readonly distributions = new Map<string, CapDistribution>();
  readonly progress = new Map<string, ProgressRecord>();
  readonly referrals = new Map<string, ReferralRecord>();
  readonly socialPosts = new Map<string, Array<{ id: string; body: string; createdAt: string }>>();
  readonly verifiedTitleCounts = new Map<string, bigint>();
  readonly verifiedCosmeticPurchases = new Set<string>();
  readonly verifiedUsers = new Set<string>();
  private readonly externalVerifier?: ExternalQuestVerificationProvider;
  private readonly titleAccounting?: DevelopmentGenesisConfig['titleAccounting'];
  private readonly questMutex = new AsyncMutex();

  constructor(config: DevelopmentGenesisConfig = {}) {
    for (const epoch of config.epochs ?? []) this.epochs.set(epoch.id, clone(epoch));
    for (const campaign of config.campaigns ?? []) this.campaigns.set(campaign.id, clone(campaign));
    for (const quest of config.quests ?? []) this.quests.set(quest.id, clone(quest));
    this.externalVerifier = config.externalVerifier;
    this.titleAccounting = config.titleAccounting;
  }

  markVerifiedHuman(userId: string): void { this.verifiedUsers.add(userId); }
  recordVerifiedTitles(userId: string, count: bigint): void { requireUnits(count, 'verified_title_count'); this.verifiedTitleCounts.set(userId, count); }
  recordVerifiedCosmeticPurchase(userId: string): void { this.verifiedCosmeticPurchases.add(userId); }
  transitionEpoch(epochId: string, status: HumanClaimEpochStatus, now: Date): HumanClaimEpoch {
    const epoch = this.epochs.get(epochId); if (!epoch) throw new Error('human_claim_epoch_not_found');
    const next = transitionMonthlyHumanClaimEpoch(epoch, status, now); this.epochs.set(epochId, next); return clone(next);
  }
  transitionCampaign(campaignId: string, status: GrowthCampaignStatus, now: Date): GrowthCampaign {
    const campaign = this.campaigns.get(campaignId); if (!campaign) throw new Error('growth_campaign_not_found');
    const quests = [...this.quests.values()].filter((quest) => quest.campaignId === campaignId);
    const next = transitionGrowthCampaign(campaign, quests, status, now); this.campaigns.set(campaignId, next); return clone(next);
  }

  private activeEpoch(now: Date): HumanClaimEpoch | null {
    const time = now.getTime();
    return [...this.epochs.values()].find((epoch) => epoch.status === 'OPEN' && time >= new Date(epoch.opensAt).getTime() && time < new Date(epoch.closesAt).getTime()) ?? null;
  }
  private activeCampaign(now: Date): GrowthCampaign | null {
    const time = now.getTime();
    return [...this.campaigns.values()].find((campaign) => campaign.status === 'ACTIVE' && time >= new Date(campaign.startsAt).getTime() && time < new Date(campaign.endsAt).getTime()) ?? null;
  }
  private participationKey(epochId: string, userId: string): string { return `${epochId}:${userId}`; }
  private progressKey(questId: string, userId: string): string { return `${questId}:${userId}`; }
  private referralCode(userId: string): string { return createHash('sha256').update(`worldcap-referral-v1|${userId}`).digest('hex').slice(0, 16).toUpperCase(); }
  private userForReferralCode(code: string): string | null {
    for (const userId of this.verifiedUsers) if (this.referralCode(userId) === code) return userId;
    return null;
  }

  async registerMonthlyClaim(user: InternalUser, now: Date) {
    this.markVerifiedHuman(user.id);
    const epoch = this.activeEpoch(now); if (!epoch) throw new Error('human_claim_not_open');
    const key = this.participationKey(epoch.id, user.id); const existing = this.participations.get(key);
    if (existing) return { participation: clone(existing), replayed: true };
    const participation: HumanClaimParticipation = { id: randomUUID(), epochId: epoch.id, userId: user.id, status: 'REGISTERED', registeredAt: iso(now), settledAt: null, settledUnits: 0n };
    this.participations.set(key, participation);
    this.epochs.set(epoch.id, { ...epoch, participantCount: epoch.participantCount + 1n });
    return { participation: clone(participation), replayed: false };
  }

  async finalizeMonthlyClaim(epochId: string, now: Date) {
    const epoch = this.epochs.get(epochId); if (!epoch) throw new Error('human_claim_epoch_not_found');
    if (epoch.status === 'FINALIZED') return { epoch: clone(epoch), replayed: true, settlements: [] };
    if (epoch.status !== 'CLOSED' || now.getTime() < new Date(epoch.closesAt).getTime()) throw new Error('human_claim_epoch_not_closed');
    const participants = [...this.participations.values()].filter((item) => item.epochId === epochId).sort((a, b) => a.userId.localeCompare(b.userId));
    const split = computeMonthlyHumanClaimSettlement(epoch.poolUnits, BigInt(participants.length));
    const settlements: CapDistribution[] = [];
    for (const participant of participants) {
      const reference = `human-claim:${epochId}:${participant.userId}`;
      if (this.distributions.has(reference)) continue;
      const distribution: CapDistribution = { id: randomUUID(), source: 'HUMAN_CLAIM', campaignId: null, questId: null, userId: participant.userId, amountUnits: split.unitsPerHuman, reason: `Monthly Human Claim ${epoch.calendarPeriod}`, reference, createdAt: iso(now), accountingMode: 'simulated' };
      this.distributions.set(reference, distribution); settlements.push(clone(distribution));
      this.participations.set(this.participationKey(epochId, participant.userId), { ...participant, status: 'SETTLED', settledAt: iso(now), settledUnits: split.unitsPerHuman });
    }
    const finalized: HumanClaimEpoch = { ...epoch, status: 'FINALIZED', finalizedAt: iso(now), participantCount: BigInt(participants.length), settledUnitsPerHuman: split.unitsPerHuman, unissuedRemainderUnits: split.unissuedRemainderUnits };
    this.epochs.set(epochId, finalized);
    return { epoch: clone(finalized), replayed: false, settlements };
  }

  private async questStatus(user: InternalUser, quest: GrowthQuest, now: Date, reserve: boolean): Promise<QuestJourneyItem> {
    const campaign = this.campaigns.get(quest.campaignId); if (!campaign || campaign.status !== 'ACTIVE') throw new Error('growth_campaign_not_active');
    const key = this.progressKey(quest.id, user.id); const existing = this.progress.get(key);
    if (existing?.status === 'CLAIMED' || existing?.status === 'QUALIFIED') return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: existing.status, progressCurrent: 1n, progressRequired: 1n, reason: null };
    let current = 0n; let required = 1n; let qualified = false; let reference: string | null = null; let reason: string | null = null;
    if (quest.verificationMode === 'EXTERNAL') {
      if (!this.externalVerifier) return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: 'UNAVAILABLE', progressCurrent: 0n, progressRequired: 1n, reason: 'Authoritative verification provider unavailable' };
      const result = await this.externalVerifier.verify({ user, quest }); qualified = result.verified; reference = result.reference; reason = result.verified ? null : 'Authoritative verification pending';
    } else if (quest.kind === 'VERIFIED_PROFILE') { qualified = this.verifiedUsers.has(user.id); current = qualified ? 1n : 0n; }
    else if (quest.kind === 'FIRST_SOCIAL_POST') { current = BigInt(this.socialPosts.get(user.id)?.length ?? 0); qualified = current > 0n; }
    else if (quest.kind === 'VERIFIED_REFERRAL') { current = BigInt([...this.referrals.values()].filter((item) => item.inviterId === user.id && item.qualifiedAt).length); qualified = current > 0n; }
    else if (quest.kind === 'TITLE_COUNT_MILESTONE') { required = quest.milestoneThreshold ?? 1n; current = this.verifiedTitleCounts.get(user.id) ?? 0n; qualified = current >= required; }
    else if (quest.kind === 'FIRST_COSMETIC_PURCHASE_REBATE') { qualified = this.verifiedCosmeticPurchases.has(user.id); current = qualified ? 1n : 0n; }
    if (!qualified) return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: quest.verificationMode === 'EXTERNAL' ? 'PENDING_VERIFICATION' : current > 0n ? 'IN_PROGRESS' : 'LOCKED', progressCurrent: current, progressRequired: required, reason };
    const qualifiedCount = BigInt([...this.progress.entries()].filter(([entryKey, progress]) => entryKey.startsWith(`${quest.id}:`) && (progress.status === 'QUALIFIED' || progress.status === 'CLAIMED')).length);
    if (quest.maxRewardedCompletions !== null && qualifiedCount >= quest.maxRewardedCompletions) return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: 'UNAVAILABLE', progressCurrent: current, progressRequired: required, reason: 'Published quest capacity exhausted' };
    if (reserve && campaign.distributedUnits + campaign.reservedUnits + quest.rewardUnits > campaign.budgetUnits) return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: 'UNAVAILABLE', progressCurrent: current, progressRequired: required, reason: 'Published campaign budget exhausted' };
    if (reserve) {
      this.progress.set(key, { status: 'QUALIFIED', reference, qualifiedAt: iso(now) });
      this.campaigns.set(campaign.id, { ...campaign, reservedUnits: campaign.reservedUnits + quest.rewardUnits });
    }
    return { questId: quest.id, code: quest.code, kind: quest.kind, verificationMode: quest.verificationMode, rewardUnits: quest.rewardUnits, status: 'QUALIFIED', progressCurrent: current || 1n, progressRequired: required, reason: null };
  }

  async evaluateQuest(user: InternalUser, questId: string, now: Date): Promise<QuestJourneyItem> {
    return this.questMutex.run(async () => {
      this.markVerifiedHuman(user.id); const quest = this.quests.get(questId); if (!quest) throw new Error('growth_quest_not_found');
      return this.questStatus(user, quest, now, true);
    });
  }

  async claimQuestReward(user: InternalUser, questId: string, now: Date) {
    return this.questMutex.run(async () => {
      this.markVerifiedHuman(user.id); const quest = this.quests.get(questId); if (!quest) throw new Error('growth_quest_not_found');
      const reference = `genesis-growth:${quest.campaignId}:${quest.id}:${user.id}`; const existing = this.distributions.get(reference);
      if (existing) return { distribution: clone(existing), replayed: true };
      const status = await this.questStatus(user, quest, now, true); if (status.status !== 'QUALIFIED') throw new Error(status.reason ? 'growth_quest_unavailable' : 'growth_quest_not_qualified');
      const campaign = this.campaigns.get(quest.campaignId)!;
      const distribution: CapDistribution = { id: randomUUID(), source: 'GENESIS_GROWTH', campaignId: campaign.id, questId: quest.id, userId: user.id, amountUnits: quest.rewardUnits, reason: quest.code, reference, createdAt: iso(now), accountingMode: 'simulated' };
      this.distributions.set(reference, distribution); this.progress.set(this.progressKey(quest.id, user.id), { status: 'CLAIMED', reference, qualifiedAt: iso(now) });
      this.campaigns.set(campaign.id, { ...campaign, reservedUnits: campaign.reservedUnits - quest.rewardUnits, distributedUnits: campaign.distributedUnits + quest.rewardUnits });
      return { distribution: clone(distribution), replayed: false };
    });
  }

  async registerReferral(user: InternalUser, inviterCode: string, now: Date) {
    this.markVerifiedHuman(user.id); const inviterId = this.userForReferralCode(inviterCode.trim().toUpperCase());
    if (!inviterId || inviterId === user.id || !this.verifiedUsers.has(inviterId)) throw new Error('referral_invalid');
    const existing = [...this.referrals.values()].find((entry) => entry.refereeId === user.id);
    if (existing) {
      if (existing.inviterId !== inviterId) throw new Error('referral_already_bound');
      return { referralId: existing.id, replayed: true };
    }
    if ((this.socialPosts.get(user.id)?.length ?? 0) > 0 || (this.verifiedTitleCounts.get(user.id) ?? 0n) > 0n) throw new Error('referral_must_precede_qualification');
    const referral: ReferralRecord = { id: randomUUID(), inviterId, refereeId: user.id, createdAt: iso(now), qualifiedAt: null };
    this.referrals.set(referral.id, referral); return { referralId: referral.id, replayed: false };
  }

  qualifyReferral(refereeId: string, now: Date): void {
    const referral = [...this.referrals.values()].find((entry) => entry.refereeId === refereeId); if (!referral || !this.verifiedUsers.has(refereeId)) throw new Error('referral_not_qualifiable');
    if (!referral.qualifiedAt) this.referrals.set(referral.id, { ...referral, qualifiedAt: iso(now) });
  }

  async createSocialPost(user: InternalUser, body: string, now: Date) {
    this.markVerifiedHuman(user.id); const clean = body.trim(); if (!clean || clean.length > 240) throw new Error('social_post_invalid');
    const post = { id: randomUUID(), body: clean, createdAt: iso(now) }; this.socialPosts.set(user.id, [post, ...(this.socialPosts.get(user.id) ?? [])]); return clone(post);
  }

  private async totals(userId?: string): Promise<CapSourceTotals> {
    const rows = [...this.distributions.values()].filter((row) => !userId || row.userId === userId);
    const source = (name: CapDistribution['source']) => rows.filter((row) => row.source === name).reduce((sum, row) => sum + row.amountUnits, 0n);
    const emptyTitle = { lockedUnits: 0n, availableUnits: 0n, claimedUnits: 0n };
    const title = userId && this.titleAccounting
      ? await this.titleAccounting(userId)
      : this.titleAccounting
        ? (await Promise.all([...this.verifiedUsers].map((id) => this.titleAccounting!(id)))).reduce((sum, item) => ({ lockedUnits: sum.lockedUnits + item.lockedUnits, availableUnits: sum.availableUnits + item.availableUnits, claimedUnits: sum.claimedUnits + item.claimedUnits }), emptyTitle)
        : emptyTitle;
    const human = source('HUMAN_CLAIM'); const growth = source('GENESIS_GROWTH'); const other = source('OTHER_FUTURE');
    return { titleEntitlementUnits: title.claimedUnits, humanClaimUnits: human, genesisGrowthUnits: growth, otherFutureUnits: other, availableUnits: title.availableUnits + title.claimedUnits + human + growth + other, lockedUnits: title.lockedUnits, spentUnits: 0n, burnedUnits: 0n, totalClaimedUnits: title.claimedUnits + human + growth + other, accountingMode: 'simulated' };
  }

  async getJourney(user: InternalUser, now: Date): Promise<GenesisJourney> {
    this.markVerifiedHuman(user.id); const campaign = this.activeCampaign(now); const epoch = this.activeEpoch(now) ?? [...this.epochs.values()].find((item) => item.status === 'FINALIZED' && item.calendarPeriod === calendarPeriodUtc(now)) ?? null;
    const participation = epoch ? this.participations.get(this.participationKey(epoch.id, user.id)) : null;
    const estimated = epoch?.status === 'OPEN' ? epoch.poolUnits / (epoch.participantCount + (participation ? 0n : 1n)) : null;
    const quests = campaign ? await Promise.all([...this.quests.values()].filter((quest) => quest.campaignId === campaign.id).map((quest) => this.questStatus(user, quest, now, false))) : [];
    return {
      campaign: campaign ? { ...clone(campaign), remainingUnits: campaign.budgetUnits - campaign.distributedUnits - campaign.reservedUnits } : null,
      quests, cap: await this.totals(user.id), referralCode: this.referralCode(user.id),
      humanClaim: { available: epoch?.status === 'OPEN', reason: epoch ? epoch.status === 'OPEN' ? null : 'Monthly pool is finalized' : 'No published monthly pool is open', epoch: epoch ? clone(epoch) : null, participation: participation?.status ?? 'NOT_CLAIMED', settledUnits: participation?.settledUnits ?? 0n, estimatedUnits: estimated, estimateLabel: estimated === null ? null : 'ESTIMATE' },
    };
  }

  async getFounderMetrics(now: Date): Promise<FounderControlMetrics> {
    const epoch = this.activeEpoch(now) ?? [...this.epochs.values()].sort((a, b) => b.calendarPeriod.localeCompare(a.calendarPeriod))[0] ?? null;
    const previousEpoch = epoch ? [...this.epochs.values()].filter((candidate) => candidate.calendarPeriod < epoch.calendarPeriod).sort((a, b) => b.calendarPeriod.localeCompare(a.calendarPeriod))[0] ?? null : null;
    const campaign = this.activeCampaign(now) ?? [...this.campaigns.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null;
    const campaignQuests = campaign ? [...this.quests.values()].filter((quest) => quest.campaignId === campaign.id) : [];
    const allProgress = [...this.progress.entries()];
    const byQuest = campaignQuests.map((quest) => {
      const records = allProgress.filter(([key]) => key.startsWith(`${quest.id}:`)).map(([, value]) => value);
      const claimed = BigInt(records.filter((record) => record.status === 'CLAIMED').length);
      return { questId: quest.id, qualified: BigInt(records.filter((record) => record.status === 'QUALIFIED').length), claimed, distributedUnits: claimed * quest.rewardUnits };
    });
    const participants = epoch?.participantCount ?? 0n;
    const previousParticipants = previousEpoch?.participantCount ?? 0n;
    const projectedShare = (factor: bigint) => participants > 0n ? (epoch?.poolUnits ?? 0n) / (participants * factor) : 0n;
    return {
      generatedAt: iso(now),
      humanClaim: {
        period: epoch?.calendarPeriod ?? null,
        poolUnits: epoch?.poolUnits ?? 0n,
        participants,
        settledUnits: (epoch?.settledUnitsPerHuman ?? 0n) * participants,
        settledUnitsPerHuman: epoch?.settledUnitsPerHuman ?? 0n,
        unissuedUnits: epoch?.unissuedRemainderUnits ?? 0n,
        previousPeriodParticipants: previousParticipants,
        participantGrowthBps: previousParticipants > 0n ? ((participants - previousParticipants) * 10_000n) / previousParticipants : null,
        projectedShare2x: projectedShare(2n),
        projectedShare5x: projectedShare(5n),
        projectedShare10x: projectedShare(10n),
      },
      product: {
        users: BigInt(this.verifiedUsers.size),
        verifiedHumans: BigInt(this.verifiedUsers.size),
        titlesIssued: [...this.verifiedTitleCounts.values()].reduce((sum, count) => sum + count, 0n),
        settledPurchases: BigInt([...this.verifiedTitleCounts.values()].filter((count) => count > 0n).length),
        activeCampaignId: campaign?.id ?? null,
        monthlyDrawStatus: null,
        quarterlyDrawStatus: null,
      },
      genesis: { campaignId: campaign?.id ?? null, budgetUnits: campaign?.budgetUnits ?? 0n, distributedUnits: campaign?.distributedUnits ?? 0n, reservedUnits: campaign?.reservedUnits ?? 0n, remainingUnits: campaign ? campaign.budgetUnits - campaign.distributedUnits - campaign.reservedUnits : 0n, participants: BigInt(new Set([...this.distributions.values()].filter((row) => row.source === 'GENESIS_GROWTH').map((row) => row.userId)).size), byQuest, verifiedReferrals: BigInt([...this.referrals.values()].filter((row) => row.qualifiedAt).length), milestoneQualifications: BigInt(allProgress.filter(([key, value]) => this.quests.get(key.split(':')[0]!)?.kind === 'TITLE_COUNT_MILESTONE' && (value.status === 'QUALIFIED' || value.status === 'CLAIMED')).length), externalPending: BigInt(allProgress.filter(([key, value]) => this.quests.get(key.split(':')[0]!)?.verificationMode === 'EXTERNAL' && value.status === 'PENDING_VERIFICATION').length) },
      cap: await this.totals(),
      trust: { immutableLedgerRows: BigInt(this.distributions.size), accountingMode: 'simulated', productionTokenTransfers: false, latestDrawId: null, manifestCommitment: null, randomnessStatus: 'NOT_CONFIGURED', externalProofStatus: 'NOT_AVAILABLE', anchorStatus: 'NOT_CONFIGURED', verifyDrawStatus: 'NOT_AVAILABLE' },
      operations: { reconciliationPending: 0n, reconciliationFailedOrStuck: 0n, drawJobsFailed: 0n, readinessStatus: 'DEVELOPMENT_MEMORY' },
    };
  }

  async getPublicSummary(now: Date): Promise<PublicCapFairnessSummary> {
    const metrics = await this.getFounderMetrics(now); const epoch = [...this.epochs.values()].sort((a, b) => b.calendarPeriod.localeCompare(a.calendarPeriod))[0] ?? null; const campaign = [...this.campaigns.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null;
    return { generatedAt: metrics.generatedAt, accountingMode: 'simulated', sources: { titleEntitlementUnits: metrics.cap.titleEntitlementUnits, humanClaimUnits: metrics.cap.humanClaimUnits, genesisGrowthUnits: metrics.cap.genesisGrowthUnits, otherFutureUnits: metrics.cap.otherFutureUnits, lockedUnits: metrics.cap.lockedUnits, burnedUnits: metrics.cap.burnedUnits, totalClaimedUnits: metrics.cap.totalClaimedUnits }, humanClaim: { calendarPeriod: epoch?.calendarPeriod ?? null, status: epoch?.status ?? null, poolUnits: epoch?.poolUnits ?? 0n, participantCount: epoch?.participantCount ?? 0n, settledUnitsPerHuman: epoch?.settledUnitsPerHuman ?? null, unissuedRemainderUnits: epoch?.unissuedRemainderUnits ?? null }, genesis: { campaignId: campaign?.id ?? null, version: campaign?.version ?? null, budgetUnits: campaign?.budgetUnits ?? 0n, distributedUnits: campaign?.distributedUnits ?? 0n, remainingUnits: campaign ? campaign.budgetUnits - campaign.distributedUnits - campaign.reservedUnits : 0n } };
  }
}
