import type { AllocationRecord, LedgerRecord } from './economyTypes.js';

export const ECONOMIC_ALLOCATION = Object.freeze({
  capRedemptionProgram: 40,
  monthlyPrize: 38,
  quarterlyJackpot: 10,
  companyTreasury: 10,
  platformOperations: 2,
} as const);

export function assertGrossAllocation(totalUnits: bigint, allocations: readonly Pick<AllocationRecord, 'bucket' | 'percentage' | 'amountUnits'>[]): void {
  if (totalUnits <= 0n) throw new Error('allocation_total_invalid');
  const expected = new Map([
    ['cap_redemption_program', ECONOMIC_ALLOCATION.capRedemptionProgram],
    ['monthly_prize_pool', ECONOMIC_ALLOCATION.monthlyPrize],
    ['quarterly_jackpot', ECONOMIC_ALLOCATION.quarterlyJackpot],
    ['company_treasury', ECONOMIC_ALLOCATION.companyTreasury],
    ['platform_operations', ECONOMIC_ALLOCATION.platformOperations],
  ]);
  if (allocations.length !== expected.size) throw new Error('allocation_bucket_set_invalid');
  for (const allocation of allocations) {
    if (expected.get(allocation.bucket) !== allocation.percentage || allocation.amountUnits < 0n) throw new Error('allocation_bucket_invalid');
    expected.delete(allocation.bucket);
  }
  if (expected.size !== 0 || allocations.reduce((sum, item) => sum + item.amountUnits, 0n) !== totalUnits) throw new Error('allocation_does_not_equal_gross');
}

export function assertSimulatedWinningsNonSpendable(entry: Pick<LedgerRecord, 'classification' | 'spendable'>): void {
  if ((entry.classification === 'simulated_scratch_prize' || entry.classification === 'simulated_draw_prize') && entry.spendable) throw new Error('simulated_winnings_cannot_be_spendable');
}

export function assertOriginalBuyerImmutable(existingBuyerId: string, proposedBuyerId: string): void {
  if (existingBuyerId !== proposedBuyerId) throw new Error('original_buyer_immutable');
}

export function assertScratchPreservesTitle(before: { currentOwnerId: string; drawEligible: boolean }, after: { currentOwnerId: string; drawEligible: boolean }): void {
  if (before.currentOwnerId !== after.currentOwnerId) throw new Error('scratch_changed_current_owner');
  if (before.drawEligible && !after.drawEligible) throw new Error('scratch_removed_draw_eligibility');
}
