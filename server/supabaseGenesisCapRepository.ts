import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { InternalUser } from './appSession.js';
import type { PersistenceConfig } from './config.js';
import type {
  CapDistribution, CapSourceTotals, FounderControlMetrics, GenesisCapRepository, GenesisJourney, GrowthCampaign,
  HumanClaimEpoch, HumanClaimParticipation, PublicCapFairnessSummary, QuestJourneyItem,
} from './genesisCapTypes.js';

function record(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}_invalid`); return value as Record<string, unknown>; }
function text(value: unknown, name: string): string { if (typeof value !== 'string') throw new Error(`${name}_invalid`); return value; }
function nullableText(value: unknown, name: string): string | null { return value === null ? null : text(value, name); }
function integer(value: unknown, name: string): bigint { const result = text(value, name); if (!/^(0|[1-9][0-9]*)$/.test(result)) throw new Error(`${name}_invalid`); return BigInt(result); }
function bool(value: unknown, name: string): boolean { if (typeof value !== 'boolean') throw new Error(`${name}_invalid`); return value; }
function array(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${name}_invalid`); return value; }

function parseEpoch(value: unknown): HumanClaimEpoch {
  const row = record(value, 'human_claim_epoch');
  return { id: text(row.id, 'epoch_id'), calendarPeriod: text(row.calendarPeriod, 'calendar_period'), status: text(row.status, 'epoch_status') as HumanClaimEpoch['status'], poolUnits: integer(row.poolUnits, 'pool_units'), opensAt: text(row.opensAt, 'opens_at'), closesAt: text(row.closesAt, 'closes_at'), publishedAt: nullableText(row.publishedAt, 'published_at'), closedAt: nullableText(row.closedAt, 'closed_at'), finalizedAt: nullableText(row.finalizedAt, 'finalized_at'), participantCount: integer(row.participantCount, 'participant_count'), settledUnitsPerHuman: row.settledUnitsPerHuman === null ? null : integer(row.settledUnitsPerHuman, 'settled_units_per_human'), unissuedRemainderUnits: row.unissuedRemainderUnits === null ? null : integer(row.unissuedRemainderUnits, 'unissued_remainder_units'), accountingMode: 'simulated' };
}
function parseParticipation(value: unknown): HumanClaimParticipation {
  const row = record(value, 'human_claim_participation');
  return { id: text(row.id, 'participation_id'), epochId: text(row.epochId, 'epoch_id'), userId: text(row.userId, 'user_id'), status: text(row.status, 'participation_status') as HumanClaimParticipation['status'], registeredAt: text(row.registeredAt, 'registered_at'), settledAt: nullableText(row.settledAt, 'settled_at'), settledUnits: integer(row.settledUnits, 'settled_units') };
}
function parseDistribution(value: unknown): CapDistribution {
  const row = record(value, 'cap_distribution');
  return { id: text(row.id, 'distribution_id'), source: text(row.source, 'distribution_source') as CapDistribution['source'], campaignId: nullableText(row.campaignId, 'campaign_id'), questId: nullableText(row.questId, 'quest_id'), userId: text(row.userId, 'user_id'), amountUnits: integer(row.amountUnits, 'amount_units'), reason: text(row.reason, 'reason'), reference: text(row.reference, 'reference'), createdAt: text(row.createdAt, 'created_at'), accountingMode: 'simulated' };
}
function parseTotals(value: unknown): CapSourceTotals {
  const row = record(value, 'cap_totals');
  return { titleEntitlementUnits: integer(row.titleEntitlementUnits, 'title_entitlement_units'), humanClaimUnits: integer(row.humanClaimUnits, 'human_claim_units'), genesisGrowthUnits: integer(row.genesisGrowthUnits, 'genesis_growth_units'), otherFutureUnits: integer(row.otherFutureUnits, 'other_future_units'), availableUnits: integer(row.availableUnits, 'available_units'), lockedUnits: integer(row.lockedUnits, 'locked_units'), spentUnits: integer(row.spentUnits, 'spent_units'), burnedUnits: integer(row.burnedUnits, 'burned_units'), totalClaimedUnits: integer(row.totalClaimedUnits, 'total_claimed_units'), accountingMode: 'simulated' };
}
function parseCampaign(value: unknown): GrowthCampaign & { remainingUnits: bigint } {
  const row = record(value, 'growth_campaign');
  return { id: text(row.id, 'campaign_id'), version: text(row.version, 'version'), name: text(row.name, 'name'), startsAt: text(row.startsAt, 'starts_at'), endsAt: text(row.endsAt, 'ends_at'), status: text(row.status, 'status') as GrowthCampaign['status'], budgetUnits: integer(row.budgetUnits, 'budget_units'), publishedAt: nullableText(row.publishedAt, 'published_at'), configCommitment: text(row.configCommitment, 'config_commitment') as `sha256:${string}`, distributedUnits: integer(row.distributedUnits, 'distributed_units'), reservedUnits: integer(row.reservedUnits, 'reserved_units'), remainingUnits: integer(row.remainingUnits, 'remaining_units'), accountingMode: 'simulated' };
}
function parseQuest(value: unknown): QuestJourneyItem {
  const row = record(value, 'quest');
  return { questId: text(row.questId, 'quest_id'), code: text(row.code, 'code'), kind: text(row.kind, 'kind') as QuestJourneyItem['kind'], verificationMode: text(row.verificationMode, 'verification_mode') as QuestJourneyItem['verificationMode'], rewardUnits: integer(row.rewardUnits, 'reward_units'), status: text(row.status, 'status') as QuestJourneyItem['status'], progressCurrent: integer(row.progressCurrent, 'progress_current'), progressRequired: integer(row.progressRequired, 'progress_required'), reason: nullableText(row.reason, 'reason') };
}

export class SupabaseGenesisCapRepository implements GenesisCapRepository {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(name: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.client.rpc(name, params); if (result.error) throw new Error(result.error.message); return result.data;
  }
  async getJourney(user: InternalUser): Promise<GenesisJourney> {
    const row = record(await this.rpc('worldcap_get_genesis_journey', { p_user_id: user.id }), 'journey');
    const human = record(row.humanClaim, 'human_claim');
    return { campaign: row.campaign === null ? null : parseCampaign(row.campaign), quests: array(row.quests, 'quests').map(parseQuest), cap: parseTotals(row.cap), referralCode: text(row.referralCode, 'referral_code'), humanClaim: { available: bool(human.available, 'available'), reason: nullableText(human.reason, 'reason'), epoch: human.epoch === null ? null : parseEpoch(human.epoch), participation: text(human.participation, 'participation') as GenesisJourney['humanClaim']['participation'], settledUnits: integer(human.settledUnits, 'settled_units'), estimatedUnits: human.estimatedUnits === null ? null : integer(human.estimatedUnits, 'estimated_units'), estimateLabel: human.estimateLabel === null ? null : 'ESTIMATE' } };
  }
  async registerMonthlyClaim(user: InternalUser) {
    const row = record(await this.rpc('worldcap_register_monthly_human_claim_v2', { p_user_id: user.id }), 'registration');
    return { participation: parseParticipation(row.participation), replayed: bool(row.replayed, 'replayed') };
  }
  async finalizeMonthlyClaim(epochId: string) {
    const row = record(await this.rpc('worldcap_finalize_monthly_human_claim_v2', { p_epoch_id: epochId }), 'finalization');
    return { epoch: parseEpoch(row.epoch), replayed: bool(row.replayed, 'replayed'), settlements: array(row.settlements, 'settlements').map(parseDistribution) };
  }
  async evaluateQuest(user: InternalUser, questId: string) { return parseQuest(await this.rpc('worldcap_evaluate_genesis_quest', { p_user_id: user.id, p_quest_id: questId })); }
  async claimQuestReward(user: InternalUser, questId: string) {
    const row = record(await this.rpc('worldcap_claim_genesis_reward', { p_user_id: user.id, p_quest_id: questId }), 'growth_claim');
    return { distribution: parseDistribution(row.distribution), replayed: bool(row.replayed, 'replayed') };
  }
  async registerReferral(user: InternalUser, inviterCode: string) {
    const row = record(await this.rpc('worldcap_register_genesis_referral', { p_user_id: user.id, p_inviter_code: inviterCode }), 'referral');
    return { referralId: text(row.referralId, 'referral_id'), replayed: bool(row.replayed, 'replayed') };
  }
  async createSocialPost(user: InternalUser, body: string) {
    const row = record(await this.rpc('worldcap_create_social_post', { p_user_id: user.id, p_body: body }), 'social_post');
    return { id: text(row.id, 'post_id'), body: text(row.body, 'body'), createdAt: text(row.createdAt, 'created_at') };
  }
  async getFounderMetrics(): Promise<FounderControlMetrics> { return parseFounder(await this.rpc('worldcap_founder_control_metrics')); }
  async getPublicSummary(): Promise<PublicCapFairnessSummary> { return parsePublic(await this.rpc('worldcap_public_cap_fairness_summary')); }
}

function parseFounder(value: unknown): FounderControlMetrics {
  const row = record(value, 'founder_metrics'); const human = record(row.humanClaim, 'human_claim'); const genesis = record(row.genesis, 'genesis'); const trust = record(row.trust, 'trust');
  return { generatedAt: text(row.generatedAt, 'generated_at'), humanClaim: { period: nullableText(human.period, 'period'), poolUnits: integer(human.poolUnits, 'pool_units'), participants: integer(human.participants, 'participants'), settledUnits: integer(human.settledUnits, 'settled_units'), unissuedUnits: integer(human.unissuedUnits, 'unissued_units'), projectedLiability2x: integer(human.projectedLiability2x, 'projected_2x'), projectedLiability5x: integer(human.projectedLiability5x, 'projected_5x'), projectedLiability10x: integer(human.projectedLiability10x, 'projected_10x') }, genesis: { campaignId: nullableText(genesis.campaignId, 'campaign_id'), budgetUnits: integer(genesis.budgetUnits, 'budget_units'), distributedUnits: integer(genesis.distributedUnits, 'distributed_units'), reservedUnits: integer(genesis.reservedUnits, 'reserved_units'), remainingUnits: integer(genesis.remainingUnits, 'remaining_units'), participants: integer(genesis.participants, 'participants'), byQuest: array(genesis.byQuest, 'by_quest').map((item) => { const entry = record(item, 'quest_metric'); return { questId: text(entry.questId, 'quest_id'), qualified: integer(entry.qualified, 'qualified'), claimed: integer(entry.claimed, 'claimed'), distributedUnits: integer(entry.distributedUnits, 'distributed_units') }; }), verifiedReferrals: integer(genesis.verifiedReferrals, 'verified_referrals'), milestoneQualifications: integer(genesis.milestoneQualifications, 'milestones'), externalPending: integer(genesis.externalPending, 'external_pending') }, cap: parseTotals(row.cap), trust: { immutableLedgerRows: integer(trust.immutableLedgerRows, 'ledger_rows'), accountingMode: 'simulated', productionTokenTransfers: false } };
}
function parsePublic(value: unknown): PublicCapFairnessSummary {
  const row = record(value, 'public_cap_summary'); const human = record(row.humanClaim, 'human_claim'); const genesis = record(row.genesis, 'genesis');
  const source = parseTotals(row.sources);
  return { generatedAt: text(row.generatedAt, 'generated_at'), accountingMode: 'simulated', sources: { titleEntitlementUnits: source.titleEntitlementUnits, humanClaimUnits: source.humanClaimUnits, genesisGrowthUnits: source.genesisGrowthUnits, otherFutureUnits: source.otherFutureUnits, lockedUnits: source.lockedUnits, burnedUnits: source.burnedUnits, totalClaimedUnits: source.totalClaimedUnits }, humanClaim: { calendarPeriod: nullableText(human.calendarPeriod, 'calendar_period'), status: human.status === null ? null : text(human.status, 'status') as PublicCapFairnessSummary['humanClaim']['status'], poolUnits: integer(human.poolUnits, 'pool_units'), participantCount: integer(human.participantCount, 'participant_count'), settledUnitsPerHuman: human.settledUnitsPerHuman === null ? null : integer(human.settledUnitsPerHuman, 'settled_units'), unissuedRemainderUnits: human.unissuedRemainderUnits === null ? null : integer(human.unissuedRemainderUnits, 'remainder') }, genesis: { campaignId: nullableText(genesis.campaignId, 'campaign_id'), version: nullableText(genesis.version, 'version'), budgetUnits: integer(genesis.budgetUnits, 'budget_units'), distributedUnits: integer(genesis.distributedUnits, 'distributed_units'), remainingUnits: integer(genesis.remainingUnits, 'remaining_units') } };
}

export function createSupabaseGenesisCapRepository(config: PersistenceConfig): SupabaseGenesisCapRepository {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('supabase_genesis_configuration_invalid');
  return new SupabaseGenesisCapRepository(createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }, global: { headers: { 'X-Client-Info': 'worldcap-genesis-cap-server' } } }));
}
