import type { InternalUser } from './appSession.js';
import { ACTIVE_CAMPAIGN_ID, MAX_TITLES_PER_PURCHASE, PURPLE_TIER_ID, type PaymentMode, type ScratchCompletion } from './economyTypes.js';
import type { EconomyRepository } from './economyRepository.js';
import type { PaymentConfig, PaymentVerifier } from './paymentVerifier.js';
import { assertVerifiedPayment } from './paymentVerifier.js';
import type { ScratchRandomnessProvider } from './randomness.js';

export class EconomyService {
  constructor(
    private readonly repository: EconomyRepository,
    private readonly verifier: PaymentVerifier,
    private readonly randomness: ScratchRandomnessProvider,
    readonly paymentConfig: PaymentConfig,
  ) {}

  paymentMode(): PaymentMode {
    if (this.paymentConfig.runtime === 'development') return 'development-fake';
    if (this.paymentConfig.runtime === 'beta' && this.paymentConfig.betaDemoEnabled) return 'beta-demo';
    if (this.paymentConfig.runtime === 'beta') return 'real';
    if (this.paymentConfig.runtime === 'testnet') return 'disabled';
    return 'real';
  }

  async createPurchaseIntent(user: InternalUser, input: { campaignId: string; tierId?: string; quantity: number }) {
    if (input.campaignId !== ACTIVE_CAMPAIGN_ID) throw new Error('campaign_not_found');
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_TITLES_PER_PURCHASE) throw new Error('invalid_quantity');
    const intent = await this.repository.createPurchaseIntent(user, input.campaignId, input.tierId ?? PURPLE_TIER_ID, input.quantity, this.paymentConfig.recipient);
    return {
      reference: intent.reference, campaignId: intent.campaignId, tierId: intent.tierId, quantity: intent.quantity,
      recipient: intent.recipient, token: intent.token, tokenAmount: intent.totalUnits.toString(),
      description: `${intent.quantity} CAP ${intent.quantity === 1 ? 'title' : 'titles'}`,
      expiresAt: intent.expiresAt, paymentMode: this.paymentMode(),
    };
  }

  async confirmPurchase(user: InternalUser, reference: string, transactionId: string) {
    const intent = await this.repository.getPurchaseIntent(user.id, reference);
    if (!intent) throw new Error('purchase_intent_not_found');
    const payment = await this.verifier.verify(transactionId, intent);
    assertVerifiedPayment(payment, intent, this.paymentConfig);
    return this.repository.completePurchase(user, intent, payment);
  }

  async snapshot(user: InternalUser) {
    const snapshot = await this.repository.getSnapshot(user.id);
    const totals = snapshot.allocations.reduce((current, row) => ({ ...current, [row.bucket]: current[row.bucket] + row.amountUnits }), {
      cap_redemption_program: 0n, monthly_prize_pool: 0n, quarterly_jackpot: 0n, company_treasury: 0n, platform_operations: 0n,
      annual_jackpot: 0n, commercial_growth: 0n,
    });
    return { ...snapshot, pools: totals, paymentMode: this.paymentMode(), paymentDisabledReason: this.paymentMode() === 'disabled' ? 'World Pay does not provide a testnet payment rail.' : null };
  }

  async revealScratch(user: InternalUser, titleId: string): Promise<ScratchCompletion> {
    void user; void titleId; void this.randomness;
    // Paid scratch was superseded by free Monthly Human Claim V2. Historical
    // results remain readable, but new liabilities cannot enter via this route.
    throw new Error('legacy_scratch_unavailable');
  }

  async claimTitleCap(user: InternalUser, titleId: string) {
    return this.repository.claimTitleCap(user, titleId);
  }
}
