import { MiniKit } from '@worldcoin/minikit-js';
import { Tokens } from '@worldcoin/minikit-js/commands';

export const ACTIVE_CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
export const PURPLE_TIER_ID = '33333333-3333-4333-8333-333333333333';
export const WLD_SCALE = 1_000_000_000_000_000_000n;

export type PaymentMode = 'real' | 'development-fake' | 'beta-demo' | 'disabled';

export interface CampaignDto { id: string; name: string; monthLabel: string; status: 'active'; titlePriceUnits: string; serialPrefix: string; monthlyDrawAt: string; annualDrawAt: string }
export interface TitleTierDto { id: string; campaignId: string; code: 'accessible' | 'purple' | 'gold'; name: string; priceUnits: string; skin: 'accessible' | 'purple' | 'gold'; status: 'active'; sortOrder: number }
export interface PurchaseDto { id: string; reference: string; userId: string; campaignId: string; tierId: string; quantity: number; unitPriceUnits: string; totalUnits: string; transactionId: string; transactionHash: string; payerAddress: string; createdAt: string; settlementMode: 'verified' | 'demo' }
export interface TitleDto { id: string; serial: string; campaignId: string; tierId: string; tierCode: 'accessible' | 'purple' | 'gold'; tierName: string; purchaseId: string; ownerId: string; originalBuyerId: string; currentOwnerId: string; createdAt: string; scratchStatus: 'available' | 'revealed'; scratchResultId: string | null; drawEligible: true; lifecycleState: 'active' | 'draw_period_complete' | 'archived' | 'eligible_for_renewal'; renewalState: 'not_eligible' | 'eligible' | 'redeemed' | 'expired'; futureRedemptionState: 'not_configured' }
export interface OwnershipEventDto { id: string; titleId: string; eventType: 'issued'; fromUserId: null; toUserId: string; purchaseId: string; createdAt: string }
export interface AllocationDto { id: string; purchaseId: string; bucket: 'monthly_prize_pool' | 'annual_jackpot' | 'platform_operations' | 'commercial_growth'; percentage: 60 | 10 | 20; amountUnits: string }
export interface LedgerDto { id: string; userId: string; classification: 'verified_purchase' | 'demo_purchase' | 'simulated_scratch_prize'; direction: 'debit' | 'credit'; amountUnits: string; spendable: boolean; referenceId: string; description: string; createdAt: string }
export interface ScratchResultDto { id: string; titleId: string; userId: string; prizeUnits: string; simulated: true; provider: string; randomnessReference: string; revealedAt: string }
export interface ActivityDto { id: string; type: 'purchase_activity' | 'winner_activity' | 'jackpot_milestone'; body: string; createdAt: string }
export interface PoolDto { monthly_prize_pool: string; annual_jackpot: string; platform_operations: string; commercial_growth: string }
export interface EconomySnapshot { campaign: CampaignDto; titleTiers: TitleTierDto[]; titlesSold: number; purchases: PurchaseDto[]; titles: TitleDto[]; ledger: LedgerDto[]; allocations: AllocationDto[]; scratchResults: ScratchResultDto[]; activity: ActivityDto[]; ownershipEvents: OwnershipEventDto[]; walletAddress: string | null; pools: PoolDto; paymentMode: PaymentMode; paymentDisabledReason: string | null }
export interface PurchaseIntentDto { reference: string; campaignId: string; tierId: string; quantity: number; recipient: string; token: 'WLD'; tokenAmount: string; description: string; expiresAt: string; paymentMode: PaymentMode }
export interface PurchaseCompletionDto { purchase: PurchaseDto; titles: TitleDto[]; replayed: boolean }
export interface PurchasePendingDto { pending: true; reference: string; status: 'pending_reconciliation' }
export interface ScratchCompletionDto { title: TitleDto; result: ScratchResultDto; replayed: boolean }

function backendUrl(): string { return (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, ''); }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body as T;
}

function developmentFakePaymentsEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_FAKE_PAYMENTS === 'true';
}

export function formatWldUnits(value: string | bigint): string {
  const units = typeof value === 'bigint' ? value : BigInt(value);
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  const whole = absolute / WLD_SCALE;
  const fraction = (absolute % WLD_SCALE).toString().padStart(18, '0').slice(0, 2);
  return `${sign}${whole.toLocaleString()}.${fraction} WLD`;
}

export const EconomyApi = {
  snapshot: () => api<EconomySnapshot>('/api/economy/snapshot'),

  async purchase(quantity: number, tierId = PURPLE_TIER_ID): Promise<PurchaseCompletionDto | PurchasePendingDto> {
    const intent = await api<PurchaseIntentDto>('/api/economy/purchase-intents', {
      method: 'POST', body: JSON.stringify({ campaignId: ACTIVE_CAMPAIGN_ID, tierId, quantity }),
    });
    let transactionId: string;
    if (intent.paymentMode === 'development-fake') {
      if (!developmentFakePaymentsEnabled()) throw new Error('Development fake payments are disabled');
      transactionId = `devtx_${crypto.randomUUID()}`;
    } else if (intent.paymentMode === 'beta-demo') {
      transactionId = `demotx_${crypto.randomUUID()}`;
    } else if (intent.paymentMode === 'disabled') {
      throw new Error('World Pay is unavailable in this environment');
    } else {
      if (!MiniKit.isInstalled()) throw new Error('Open WorldCAP inside World App to pay with WLD');
      const result = await MiniKit.pay({
        reference: intent.reference,
        to: intent.recipient,
        tokens: [{ symbol: Tokens.WLD, token_amount: intent.tokenAmount }],
        description: intent.description,
      });
      if (!result.executedWith || !result.data?.transactionId) throw new Error('Payment was not completed');
      transactionId = result.data.transactionId;
    }
    return api<PurchaseCompletionDto | PurchasePendingDto>(`/api/economy/purchase-intents/${encodeURIComponent(intent.reference)}/confirm`, {
      method: 'POST', body: JSON.stringify({ transactionId }),
    });
  },

  reveal: (titleId: string) => api<ScratchCompletionDto>(`/api/economy/titles/${encodeURIComponent(titleId)}/scratch`, { method: 'POST', body: '{}' }),
};
