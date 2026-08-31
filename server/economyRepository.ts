import { randomUUID } from 'node:crypto';
import type { InternalUser } from './appSession.js';
import {
  ACCESSIBLE_TIER_ID, ACTIVE_CAMPAIGN_ID, DEFAULT_SCRATCH_TIERS, GOLD_TIER_ID, PURPLE_TIER_ID, TITLE_PRICE_UNITS, type ActivityRecord, type AllocationRecord,
  type CampaignRecord, type EconomySnapshotRecord, type LedgerRecord, type PurchaseCompletion,
  type OwnershipEventRecord, type PurchaseIntentRecord, type PurchaseRecord, type ScratchCompletion, type ScratchResultRecord,
  type ScratchTierConfig, type TitleRecord, type TitleTierRecord, type VerifiedPayment,
} from './economyTypes.js';
import { allocateWld } from './tokenUnits.js';
import { assertGrossAllocation, assertScratchPreservesTitle, assertSimulatedWinningsNonSpendable } from './protocolInvariants.js';

export interface EconomyRepository {
  createPurchaseIntent(user: InternalUser, campaignId: string, tierId: string, quantity: number, recipient: string): Promise<PurchaseIntentRecord>;
  getPurchaseIntent(userId: string, reference: string): Promise<PurchaseIntentRecord | null>;
  completePurchase(user: InternalUser, intent: PurchaseIntentRecord, payment: VerifiedPayment): Promise<PurchaseCompletion>;
  getSnapshot(userId: string): Promise<EconomySnapshotRecord>;
  revealScratch(user: InternalUser, titleId: string, prizeUnits: bigint, randomnessReference: string, provider: string): Promise<ScratchCompletion>;
  getScratchTiers(userId: string, titleId: string): Promise<ScratchTierConfig[]>;
}

export const ACTIVE_CAMPAIGN: CampaignRecord = {
  id: ACTIVE_CAMPAIGN_ID,
  name: 'September Rise',
  monthLabel: 'September 2026',
  status: 'active',
  titlePriceUnits: TITLE_PRICE_UNITS,
  serialPrefix: 'SEP26',
  monthlyDrawAt: '2026-09-30T20:00:00.000Z',
  annualDrawAt: '2026-12-30T20:00:00.000Z',
};

export const ACTIVE_TITLE_TIERS: TitleTierRecord[] = [
  { id: ACCESSIBLE_TIER_ID, campaignId: ACTIVE_CAMPAIGN_ID, code: 'accessible', name: 'Accessible', priceUnits: 500_000_000_000_000_000n, skin: 'accessible', status: 'active', sortOrder: 1, scratchTiers: DEFAULT_SCRATCH_TIERS },
  { id: PURPLE_TIER_ID, campaignId: ACTIVE_CAMPAIGN_ID, code: 'purple', name: 'Purple', priceUnits: TITLE_PRICE_UNITS, skin: 'purple', status: 'active', sortOrder: 2, scratchTiers: DEFAULT_SCRATCH_TIERS },
  { id: GOLD_TIER_ID, campaignId: ACTIVE_CAMPAIGN_ID, code: 'gold', name: 'Gold', priceUnits: 20_000_000_000_000_000_000n, skin: 'gold', status: 'active', sortOrder: 3, scratchTiers: DEFAULT_SCRATCH_TIERS },
];

class AsyncMutex {
  private current = Promise.resolve();
  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.current;
    let release: () => void = () => {};
    this.current = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}

export class DevelopmentMemoryEconomyRepository implements EconomyRepository {
  readonly intents = new Map<string, PurchaseIntentRecord>();
  readonly purchases = new Map<string, PurchaseRecord>();
  readonly transactionIds = new Map<string, string>();
  readonly titles = new Map<string, TitleRecord>();
  readonly allocations: AllocationRecord[] = [];
  readonly ledger: LedgerRecord[] = [];
  readonly scratchResults = new Map<string, ScratchResultRecord>();
  readonly ownershipEvents: OwnershipEventRecord[] = [];
  readonly activity: ActivityRecord[] = [];
  private readonly mutex = new AsyncMutex();
  private nextTitleSequence = 1;

  async createPurchaseIntent(user: InternalUser, campaignId: string, tierId: string, quantity: number, recipient: string): Promise<PurchaseIntentRecord> {
    if (campaignId !== ACTIVE_CAMPAIGN.id) throw new Error('campaign_not_found');
    const tier = ACTIVE_TITLE_TIERS.find((candidate) => candidate.id === tierId && candidate.status === 'active');
    if (!tier) throw new Error('title_tier_not_found');
    const now = new Date();
    const intent: PurchaseIntentRecord = {
      reference: randomUUID(), userId: user.id, campaignId, tierId, quantity,
      unitPriceUnits: tier.priceUnits,
      totalUnits: tier.priceUnits * BigInt(quantity), recipient, token: 'WLD', status: 'pending',
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), createdAt: now.toISOString(),
      completedPurchaseId: null, transactionId: null,
    };
    this.intents.set(intent.reference, intent);
    return intent;
  }

  async getPurchaseIntent(userId: string, reference: string) {
    const intent = this.intents.get(reference);
    return intent?.userId === userId ? { ...intent } : null;
  }

  async completePurchase(user: InternalUser, suppliedIntent: PurchaseIntentRecord, payment: VerifiedPayment): Promise<PurchaseCompletion> {
    return this.mutex.run(() => {
      const intent = this.intents.get(suppliedIntent.reference);
      if (!intent || intent.userId !== user.id) throw new Error('purchase_intent_not_found');
      if (intent.status === 'completed') {
        if (intent.transactionId !== payment.transactionId || !intent.completedPurchaseId) throw new Error('purchase_reference_consumed');
        const purchase = this.purchases.get(intent.completedPurchaseId);
        if (!purchase) throw new Error('purchase_invariant_failed');
        return { purchase, titles: [...this.titles.values()].filter((title) => title.purchaseId === purchase.id), replayed: true };
      }
      if (new Date(intent.expiresAt).getTime() <= Date.now()) { intent.status = 'expired'; throw new Error('purchase_intent_expired'); }
      if (this.transactionIds.has(payment.transactionId)) throw new Error('payment_transaction_consumed');

      const createdAt = new Date().toISOString();
      const tier = ACTIVE_TITLE_TIERS.find((candidate) => candidate.id === intent.tierId);
      if (!tier) throw new Error('title_tier_not_found');
      const purchase: PurchaseRecord = {
        id: randomUUID(), reference: intent.reference, userId: user.id, campaignId: intent.campaignId, tierId: intent.tierId,
        quantity: intent.quantity, unitPriceUnits: intent.unitPriceUnits, totalUnits: intent.totalUnits,
        transactionId: payment.transactionId, transactionHash: payment.transactionHash,
        payerAddress: payment.from.toLowerCase(), createdAt, settlementMode: payment.settlementMode === 'demo' ? 'demo' : 'verified',
      };
      const issued: TitleRecord[] = [];
      for (let index = 0; index < intent.quantity; index += 1) {
        const sequence = this.nextTitleSequence++;
        const title: TitleRecord = {
          id: randomUUID(), serial: `${tier.code.toUpperCase()}-${ACTIVE_CAMPAIGN.serialPrefix}-${String(sequence).padStart(6, '0')}`,
          campaignId: intent.campaignId, tierId: tier.id, tierCode: tier.code, tierName: tier.name,
          purchaseId: purchase.id, ownerId: user.id, originalBuyerId: user.id, currentOwnerId: user.id, createdAt,
          scratchStatus: 'available', scratchResultId: null, drawEligible: true, futureRedemptionState: 'not_configured',
          lifecycleState: 'active', renewalState: 'not_eligible',
        };
        this.titles.set(title.id, title); issued.push(title);
        this.ownershipEvents.push({ id: randomUUID(), titleId: title.id, eventType: 'issued', fromUserId: null, toUserId: user.id, purchaseId: purchase.id, createdAt });
      }
      const parts = allocateWld(intent.totalUnits);
      const rows: Array<[AllocationRecord['bucket'], 60 | 10 | 20, bigint]> = [
        ['monthly_prize_pool', 60, parts.monthly], ['annual_jackpot', 10, parts.annual],
        ['platform_operations', 20, parts.platform], ['commercial_growth', 10, parts.commercial],
      ];
      const allocations: AllocationRecord[] = rows.map(([bucket, percentage, amountUnits]) => ({ id: randomUUID(), purchaseId: purchase.id, bucket, percentage, amountUnits }));
      assertGrossAllocation(intent.totalUnits, allocations);
      this.allocations.push(...allocations);
      this.ledger.unshift({ id: randomUUID(), userId: user.id, classification: purchase.settlementMode === 'demo' ? 'demo_purchase' : 'verified_purchase', direction: 'debit', amountUnits: intent.totalUnits, spendable: purchase.settlementMode === 'verified', referenceId: purchase.id, description: `${intent.quantity} ${purchase.settlementMode === 'demo' ? 'non-monetary beta demo' : 'verified'} ${ACTIVE_CAMPAIGN.monthLabel} title${intent.quantity === 1 ? '' : 's'}`, createdAt });
      this.activity.unshift({ id: randomUUID(), type: 'purchase_activity', body: `${user.username} added ${intent.quantity} title${intent.quantity === 1 ? '' : 's'} to the draw.`, createdAt });
      this.purchases.set(purchase.id, purchase); this.transactionIds.set(payment.transactionId, purchase.id);
      intent.status = 'completed'; intent.completedPurchaseId = purchase.id; intent.transactionId = payment.transactionId;
      return { purchase, titles: issued, replayed: false };
    });
  }

  async getSnapshot(userId: string): Promise<EconomySnapshotRecord> {
    return {
      campaign: ACTIVE_CAMPAIGN,
      titleTiers: ACTIVE_TITLE_TIERS,
      titlesSold: this.titles.size,
      purchases: [...this.purchases.values()].filter((purchase) => purchase.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      titles: [...this.titles.values()].filter((title) => title.ownerId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ledger: this.ledger.filter((entry) => entry.userId === userId),
      allocations: [...this.allocations], scratchResults: [...this.scratchResults.values()].filter((result) => result.userId === userId),
      activity: [...this.activity],
      ownershipEvents: this.ownershipEvents.filter((event) => event.toUserId === userId),
      walletAddress: [...this.purchases.values()].find((purchase) => purchase.userId === userId)?.payerAddress ?? null,
    };
  }

  async getScratchTiers(userId: string, titleId: string): Promise<ScratchTierConfig[]> {
    const title = this.titles.get(titleId);
    if (!title || title.currentOwnerId !== userId) throw new Error('title_not_found');
    const tier = ACTIVE_TITLE_TIERS.find((candidate) => candidate.id === title.tierId);
    if (!tier) throw new Error('scratch_configuration_invalid');
    return tier.scratchTiers;
  }

  async revealScratch(user: InternalUser, titleId: string, prizeUnits: bigint, randomnessReference: string, provider: string): Promise<ScratchCompletion> {
    return this.mutex.run(() => {
      const title = this.titles.get(titleId);
      if (!title || title.ownerId !== user.id) throw new Error('title_not_found');
      if (title.scratchResultId) {
        const existing = this.scratchResults.get(title.scratchResultId);
        if (!existing) throw new Error('scratch_invariant_failed');
        return { title, result: existing, replayed: true };
      }
      const before = { currentOwnerId: title.currentOwnerId, drawEligible: title.drawEligible };
      const result: ScratchResultRecord = { id: randomUUID(), titleId, userId: user.id, prizeUnits, simulated: true, provider, randomnessReference, revealedAt: new Date().toISOString() };
      title.scratchStatus = 'revealed'; title.scratchResultId = result.id;
      this.scratchResults.set(result.id, result);
      if (prizeUnits > 0n) {
        const ledgerEntry: LedgerRecord = { id: randomUUID(), userId: user.id, classification: 'simulated_scratch_prize', direction: 'credit', amountUnits: prizeUnits, spendable: false, referenceId: result.id, description: `Simulated scratch result · ${title.serial}`, createdAt: result.revealedAt };
        assertSimulatedWinningsNonSpendable(ledgerEntry);
        this.ledger.unshift(ledgerEntry);
        this.activity.unshift({ id: randomUUID(), type: 'winner_activity', body: `${user.username} revealed a simulated scratch prize.`, createdAt: result.revealedAt });
      }
      assertScratchPreservesTitle(before, title);
      return { title, result, replayed: false };
    });
  }
}
