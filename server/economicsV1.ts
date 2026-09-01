import { selectUniqueWinningIndices, selectWinningIndex } from './drawSelection.js';

export const MONTHLY_WINNER_COUNT = 5n;
export const MONTHLY_PAYOUT_BASIS_POINTS = Object.freeze([5_500, 2_500, 1_000, 600, 400] as const);

export interface OrderedDrawWinner {
  ordinal: number;
  winningIndex: bigint;
  titleId: string;
  payoutBasisPoints: number;
  payoutUnits: bigint;
}

export function splitMonthlyPrizePool(prizePoolUnits: bigint): readonly bigint[] {
  if (prizePoolUnits < 0n) throw new Error('monthly_prize_pool_invalid');
  const amounts = MONTHLY_PAYOUT_BASIS_POINTS.map((basisPoints) => prizePoolUnits * BigInt(basisPoints) / 10_000n);
  amounts[amounts.length - 1] = prizePoolUnits - amounts.slice(0, -1).reduce((sum, amount) => sum + amount, 0n);
  return Object.freeze(amounts);
}

export function resolveOrderedWinners(input: {
  drawId: string;
  drawKind: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL_LEGACY';
  randomnessSeed: bigint;
  entries: readonly { titleId: string }[];
  prizePoolUnits: bigint;
}): readonly OrderedDrawWinner[] {
  if (input.entries.length === 0) throw new Error('eligible_count_invalid');
  if (input.prizePoolUnits < 0n) throw new Error('draw_prize_pool_invalid');

  if (input.drawKind !== 'MONTHLY') {
    const winningIndex = selectWinningIndex(input.randomnessSeed, BigInt(input.entries.length));
    const winner = input.entries[Number(winningIndex)];
    if (!winner) throw new Error('winning_title_unavailable');
    return Object.freeze([{ ordinal: 1, winningIndex, titleId: winner.titleId, payoutBasisPoints: 10_000, payoutUnits: input.prizePoolUnits }]);
  }

  if (input.entries.length < Number(MONTHLY_WINNER_COUNT)) throw new Error('monthly_draw_requires_five_eligible_titles');
  const indices = selectUniqueWinningIndices(input.randomnessSeed, BigInt(input.entries.length), MONTHLY_WINNER_COUNT, input.drawId);
  const amounts = splitMonthlyPrizePool(input.prizePoolUnits);
  return Object.freeze(indices.map((winningIndex, index) => {
    const winner = input.entries[Number(winningIndex)];
    if (!winner) throw new Error('winning_title_unavailable');
    return Object.freeze({
      ordinal: index + 1,
      winningIndex,
      titleId: winner.titleId,
      payoutBasisPoints: MONTHLY_PAYOUT_BASIS_POINTS[index]!,
      payoutUnits: amounts[index]!,
    });
  }));
}

export function makeCapRedemptionAvailable<T extends {
  capRedemptionState: 'locked' | 'available' | 'claimed' | 'expired';
  drawEligible: boolean;
}>(title: T, drawKind: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL_LEGACY'): T {
  if (drawKind !== 'MONTHLY' || title.capRedemptionState !== 'locked') return title;
  return { ...title, capRedemptionState: 'available', drawEligible: title.drawEligible };
}

export function claimCapRedemption<T extends {
  capRedemptionState: 'locked' | 'available' | 'claimed' | 'expired';
  capEntitlementUnits: bigint;
  drawEligible: boolean;
}>(title: T): { title: T; claimedUnits: bigint; replayed: boolean } {
  if (title.capRedemptionState === 'locked') throw new Error('cap_redemption_not_available');
  if (title.capRedemptionState === 'expired') throw new Error('cap_redemption_expired');
  if (title.capRedemptionState === 'claimed') return { title, claimedUnits: title.capEntitlementUnits, replayed: true };
  return {
    title: { ...title, capRedemptionState: 'claimed', drawEligible: title.drawEligible },
    claimedUnits: title.capEntitlementUnits,
    replayed: false,
  };
}
