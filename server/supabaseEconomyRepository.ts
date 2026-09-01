import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { InternalUser } from './appSession.js';
import type { PersistenceConfig } from './config.js';
import type { EconomyRepository } from './economyRepository.js';
import type {
  ActivityRecord, AllocationRecord, CampaignRecord, EconomySnapshotRecord, LedgerRecord, OwnershipEventRecord,
  PurchaseCompletion, PurchaseIntentRecord, PurchaseRecord, ScratchCompletion, ScratchResultRecord,
  ScratchTierConfig, TitleRecord, TitleTierRecord, VerifiedPayment,
} from './economyTypes.js';
import { parseUnitString } from './tokenUnits.js';
import { ECONOMIC_MODEL_VERSION, LEGACY_ECONOMIC_MODEL_VERSION, PURPLE_TIER_ID } from './economyTypes.js';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringField(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value !== 'string') throw new Error('Invalid persistence response'); return value; }
function numberField(row: Record<string, unknown>, key: string): number { const value = row[key]; if (!Number.isSafeInteger(value)) throw new Error('Invalid persistence response'); return value as number; }
function nullableString(row: Record<string, unknown>, key: string): string | null { const value = row[key]; if (value !== null && typeof value !== 'string') throw new Error('Invalid persistence response'); return value; }
function optionalString(row: Record<string, unknown>, key: string, fallback: string): string { const value = row[key]; if (value === undefined || value === null) return fallback; if (typeof value !== 'string') throw new Error('Invalid persistence response'); return value; }
function parseScratchTiers(value: unknown): ScratchTierConfig[] {
  if (!isRecord(value) || !Array.isArray(value.tiers) || value.tiers.length === 0) throw new Error('Invalid scratch configuration');
  const tiers = value.tiers.map((item) => {
    if (!isRecord(item) || !Number.isSafeInteger(item.upper_bps) || (item.upper_bps as number) < 1 || (item.upper_bps as number) > 10_000) throw new Error('Invalid scratch configuration');
    return { upperBoundBasisPoints: item.upper_bps as number, prizeUnits: parseUnitString(item.prize_units) };
  });
  if (tiers.at(-1)?.upperBoundBasisPoints !== 10_000 || tiers.some((tier, index) => index > 0 && tier.upperBoundBasisPoints <= tiers[index - 1]!.upperBoundBasisPoints)) throw new Error('Invalid scratch configuration');
  return tiers;
}

function parseIntent(value: unknown): PurchaseIntentRecord {
  if (!isRecord(value)) throw new Error('Invalid purchase intent response');
  return {
    reference: stringField(value, 'reference'), userId: stringField(value, 'user_id'), campaignId: stringField(value, 'campaign_id'), tierId: stringField(value, 'tier_id'),
    quantity: numberField(value, 'quantity'), unitPriceUnits: parseUnitString(value.unit_price_units), totalUnits: parseUnitString(value.total_units),
    recipient: stringField(value, 'recipient'), token: stringField(value, 'token') as 'WLD', status: stringField(value, 'status') as PurchaseIntentRecord['status'],
    expiresAt: stringField(value, 'expires_at'), createdAt: stringField(value, 'created_at'),
    completedPurchaseId: nullableString(value, 'completed_purchase_id'), transactionId: nullableString(value, 'transaction_id'),
    economicModelVersion: optionalString(value, 'economic_model_version', LEGACY_ECONOMIC_MODEL_VERSION) as PurchaseIntentRecord['economicModelVersion'],
  };
}

function parsePurchase(value: unknown): PurchaseRecord {
  if (!isRecord(value)) throw new Error('Invalid purchase response');
  return {
    id: stringField(value, 'id'), reference: stringField(value, 'reference'), userId: stringField(value, 'user_id'), campaignId: stringField(value, 'campaign_id'), tierId: optionalString(value, 'tier_id', PURPLE_TIER_ID),
    quantity: numberField(value, 'quantity'), unitPriceUnits: parseUnitString(value.unit_price_units), totalUnits: parseUnitString(value.total_units),
    transactionId: stringField(value, 'transaction_id'), transactionHash: stringField(value, 'transaction_hash'), payerAddress: stringField(value, 'payer_address'), createdAt: stringField(value, 'created_at'), settlementMode: optionalString(value, 'settlement_mode', 'verified') as PurchaseRecord['settlementMode'],
    economicModelVersion: optionalString(value, 'economic_model_version', LEGACY_ECONOMIC_MODEL_VERSION) as PurchaseRecord['economicModelVersion'],
  };
}

function parseTitle(value: unknown): TitleRecord {
  if (!isRecord(value)) throw new Error('Invalid title response');
  return {
    id: stringField(value, 'id'), serial: stringField(value, 'serial'), campaignId: stringField(value, 'campaign_id'), tierId: optionalString(value, 'tier_id', PURPLE_TIER_ID), tierCode: optionalString(value, 'tier_code', 'purple') as TitleRecord['tierCode'], tierName: optionalString(value, 'tier_name', 'Purple'), purchaseId: stringField(value, 'purchase_id'), ownerId: optionalString(value, 'current_owner_id', stringField(value, 'owner_id')), originalBuyerId: optionalString(value, 'original_buyer_id', stringField(value, 'owner_id')), currentOwnerId: optionalString(value, 'current_owner_id', stringField(value, 'owner_id')), createdAt: stringField(value, 'created_at'),
    scratchStatus: stringField(value, 'scratch_status') as TitleRecord['scratchStatus'], scratchResultId: nullableString(value, 'scratch_result_id'),
    drawEligible: true, lifecycleState: optionalString(value, 'lifecycle_state', 'active') as TitleRecord['lifecycleState'], renewalState: optionalString(value, 'renewal_state', 'not_eligible') as TitleRecord['renewalState'], futureRedemptionState: 'not_configured',
    capRedemptionState: optionalString(value, 'cap_redemption_state', 'locked') as TitleRecord['capRedemptionState'], capEntitlementUnits: parseUnitString(value.cap_entitlement_units ?? '0'),
  };
}

function parseCompletion(value: unknown): PurchaseCompletion {
  if (!isRecord(value) || !Array.isArray(value.titles) || typeof value.replayed !== 'boolean') throw new Error('Invalid purchase completion');
  return { purchase: parsePurchase(value.purchase), titles: value.titles.map(parseTitle), replayed: value.replayed };
}

function parseScratch(value: unknown): ScratchCompletion {
  if (!isRecord(value) || typeof value.replayed !== 'boolean' || !isRecord(value.result)) throw new Error('Invalid scratch completion');
  const result = value.result;
  return {
    title: parseTitle(value.title), replayed: value.replayed,
    result: {
      id: stringField(result, 'id'), titleId: stringField(result, 'title_id'), userId: stringField(result, 'user_id'),
      prizeUnits: parseUnitString(result.prize_units), simulated: true, provider: stringField(result, 'provider'),
      randomnessReference: stringField(result, 'randomness_reference'), revealedAt: stringField(result, 'revealed_at'),
    },
  };
}

function parseSnapshot(value: unknown): EconomySnapshotRecord {
  if (!isRecord(value) || !isRecord(value.campaign) || !Array.isArray(value.purchases) || !Array.isArray(value.titles)
    || !Array.isArray(value.title_tiers) || !Array.isArray(value.ledger) || !Array.isArray(value.allocations) || !Array.isArray(value.scratch_results) || !Array.isArray(value.activity) || !Array.isArray(value.ownership_events)) throw new Error('Invalid snapshot response');
  const campaign = value.campaign;
  const parsedCampaign: CampaignRecord = {
    id: stringField(campaign, 'id'), name: stringField(campaign, 'name'), monthLabel: stringField(campaign, 'month_label'), status: 'active',
    titlePriceUnits: parseUnitString(campaign.title_price_units), serialPrefix: stringField(campaign, 'serial_prefix'),
    monthlyDrawAt: stringField(campaign, 'monthly_draw_at'), quarterlyDrawAt: optionalString(campaign, 'quarterly_draw_at', stringField(campaign, 'annual_draw_at')),
  };
  const titleTiers: TitleTierRecord[] = value.title_tiers.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid title tier response');
    return { id: stringField(item, 'id'), campaignId: stringField(item, 'campaign_id'), code: stringField(item, 'code') as TitleTierRecord['code'], name: stringField(item, 'name'), priceUnits: parseUnitString(item.price_units), skin: stringField(item, 'skin') as TitleTierRecord['skin'], status: 'active', sortOrder: numberField(item, 'sort_order'), scratchTiers: parseScratchTiers(item.scratch_config) };
  });
  const allocations: AllocationRecord[] = value.allocations.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid allocation response');
    return { id: stringField(item, 'id'), purchaseId: stringField(item, 'purchase_id'), bucket: stringField(item, 'bucket') as AllocationRecord['bucket'], percentage: numberField(item, 'percentage') as AllocationRecord['percentage'], amountUnits: parseUnitString(item.amount_units) };
  });
  const ledger: LedgerRecord[] = value.ledger.map((item) => {
    if (!isRecord(item) || typeof item.spendable !== 'boolean') throw new Error('Invalid ledger response');
    return { id: stringField(item, 'id'), userId: stringField(item, 'user_id'), classification: stringField(item, 'classification') as LedgerRecord['classification'], direction: stringField(item, 'direction') as LedgerRecord['direction'], amountUnits: parseUnitString(item.amount_units), spendable: item.spendable, referenceId: stringField(item, 'reference_id'), description: stringField(item, 'description'), createdAt: stringField(item, 'created_at') };
  });
  const scratchResults: ScratchResultRecord[] = value.scratch_results.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid scratch response');
    return { id: stringField(item, 'id'), titleId: stringField(item, 'title_id'), userId: stringField(item, 'user_id'), prizeUnits: parseUnitString(item.prize_units), simulated: true, provider: stringField(item, 'provider'), randomnessReference: stringField(item, 'randomness_reference'), revealedAt: stringField(item, 'revealed_at') };
  });
  const activity: ActivityRecord[] = value.activity.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid activity response');
    return { id: stringField(item, 'id'), type: stringField(item, 'type') as ActivityRecord['type'], body: stringField(item, 'body'), createdAt: stringField(item, 'created_at') };
  });
  const ownershipEvents: OwnershipEventRecord[] = value.ownership_events.map((item) => {
    if (!isRecord(item)) throw new Error('Invalid ownership event response');
    return { id: stringField(item, 'id'), titleId: stringField(item, 'title_id'), eventType: 'issued', fromUserId: null, toUserId: stringField(item, 'to_user_id'), purchaseId: stringField(item, 'purchase_id'), createdAt: stringField(item, 'created_at') };
  });
  return { campaign: parsedCampaign, titleTiers, titlesSold: numberField(value, 'titles_sold'), purchases: value.purchases.map(parsePurchase), titles: value.titles.map(parseTitle), ledger, allocations, scratchResults, activity, ownershipEvents, walletAddress: nullableString(value, 'wallet_address') };
}

export function createSupabaseEconomyRepository(config: PersistenceConfig): EconomyRepository {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }, global: { headers: { 'X-Client-Info': 'worldprize-economy-server' } } });
  return new SupabaseEconomyRepository(client);
}

class SupabaseEconomyRepository implements EconomyRepository {
  constructor(private readonly client: SupabaseClient) {}
  async createPurchaseIntent(user: InternalUser, campaignId: string, tierId: string, quantity: number, recipient: string) {
    const tier = await this.client.from('title_tiers').select('price_units').eq('id', tierId).eq('campaign_id', campaignId).eq('status', 'active').single();
    if (tier.error || !tier.data) throw new Error('title_tier_not_found');
    const unitPriceUnits = parseUnitString(tier.data.price_units);
    const { data, error } = await this.client.from('purchase_intents').insert({ user_id: user.id, campaign_id: campaignId, tier_id: tierId, quantity, unit_price_units: unitPriceUnits.toString(), total_units: (unitPriceUnits * BigInt(quantity)).toString(), recipient, token: 'WLD', economic_model_version: ECONOMIC_MODEL_VERSION }).select('*').single();
    if (error || !data) throw new Error('purchase_intent_failed');
    return parseIntent(data);
  }
  async getPurchaseIntent(userId: string, reference: string) {
    const { data, error } = await this.client.from('purchase_intents').select('*').eq('reference', reference).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('purchase_intent_failed');
    return data ? parseIntent(data) : null;
  }
  async getScratchTiers(userId: string, titleId: string) {
    const title = await this.client.from('titles').select('tier_id,current_owner_id').eq('id', titleId).eq('current_owner_id', userId).maybeSingle();
    if (title.error) throw new Error('scratch_configuration_failed');
    if (!title.data) throw new Error('title_not_found');
    const tier = await this.client.from('title_tiers').select('scratch_config').eq('id', title.data.tier_id).eq('status', 'active').single();
    if (tier.error || !tier.data) throw new Error('scratch_configuration_invalid');
    return parseScratchTiers(tier.data.scratch_config);
  }
  async completePurchase(user: InternalUser, intent: PurchaseIntentRecord, payment: VerifiedPayment) {
    const rpc = payment.settlementMode === 'demo' ? 'worldcap_complete_demo_purchase' : 'worldcap_complete_purchase_economics_v1';
    const { data, error } = await this.client.rpc(rpc, { p_user_id: user.id, p_reference: intent.reference, p_transaction_id: payment.transactionId, p_transaction_hash: payment.transactionHash, p_payer_address: payment.from.toLowerCase() });
    if (error || !data) {
      const message = error?.message ?? '';
      if (message.includes('purchase_reference_consumed')) throw new Error('purchase_reference_consumed');
      if (message.includes('payment_transaction_consumed')) throw new Error('payment_transaction_consumed');
      if (message.includes('purchase_intent_expired')) throw new Error('purchase_intent_expired');
      throw new Error('purchase_completion_failed');
    }
    return parseCompletion(data);
  }
  async getSnapshot(userId: string) {
    const { data, error } = await this.client.rpc('worldprize_get_snapshot', { p_user_id: userId });
    if (error || !data) throw new Error('snapshot_failed');
    let snapshot = parseSnapshot(data);
    if (snapshot.titles.length > 0) {
      const caps = await this.client.from('title_cap_entitlements').select('title_id,redemption_state,entitlement_units').in('title_id', snapshot.titles.map((title) => title.id));
      if (caps.error) throw new Error('snapshot_failed');
      const byTitle = new Map((caps.data ?? []).map((cap) => [cap.title_id, cap]));
      snapshot = { ...snapshot, titles: snapshot.titles.map((title) => {
        const cap = byTitle.get(title.id);
        return cap ? { ...title, capRedemptionState: cap.redemption_state as TitleRecord['capRedemptionState'], capEntitlementUnits: parseUnitString(cap.entitlement_units) } : title;
      }) };
    }
    const purchaseMetadata = await this.client.from('purchases').select('id,settlement_mode,economic_model_version').eq('user_id', userId);
    if (purchaseMetadata.error) throw new Error('snapshot_failed');
    const byPurchase = new Map((purchaseMetadata.data ?? []).map((row) => [row.id, row]));
    return { ...snapshot, purchases: snapshot.purchases.map((purchase): PurchaseRecord => {
      const metadata = byPurchase.get(purchase.id);
      return metadata ? { ...purchase, settlementMode: metadata.settlement_mode as PurchaseRecord['settlementMode'], economicModelVersion: metadata.economic_model_version as PurchaseRecord['economicModelVersion'] } : purchase;
    }) };
  }
  async revealScratch(user: InternalUser, titleId: string, prizeUnits: bigint, randomnessReference: string, provider: string) {
    const { data, error } = await this.client.rpc('worldprize_reveal_scratch', { p_user_id: user.id, p_title_id: titleId, p_prize_units: prizeUnits.toString(), p_randomness_reference: randomnessReference, p_provider: provider });
    if (error || !data) throw new Error(error?.message.includes('title_not_found') ? 'title_not_found' : 'scratch_failed');
    return parseScratch(data);
  }
  async claimTitleCap(user: InternalUser, titleId: string) {
    const { data, error } = await this.client.rpc('worldcap_claim_title_cap', { p_user_id: user.id, p_title_id: titleId });
    if (error || !isRecord(data)) {
      const message = error?.message ?? '';
      if (message.includes('not_available')) throw new Error('cap_redemption_not_available');
      if (message.includes('not_owned')) throw new Error('title_not_found');
      throw new Error('cap_redemption_failed');
    }
    return { titleId: stringField(data, 'title_id'), claimedUnits: parseUnitString(data.claimed_units), drawEligible: true as const, replayed: data.replayed === true };
  }
}
