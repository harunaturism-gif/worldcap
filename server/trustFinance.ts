export type VaultType = 'MONTHLY_PRIZE' | 'ANNUAL_JACKPOT' | 'PLATFORM' | 'GROWTH' | 'SCRATCH_RESERVE';
export type PrizeVaultType = Extract<VaultType, 'MONTHLY_PRIZE' | 'ANNUAL_JACKPOT' | 'SCRATCH_RESERVE'>;

export interface VaultSnapshot {
  id: string;
  campaignId: string | null;
  vaultType: VaultType;
  fundedAmountUnits: bigint;
  committedLiabilityUnits: bigint;
  availableAmountUnits: bigint;
}

export function createVault(input: Omit<VaultSnapshot, 'availableAmountUnits'>): VaultSnapshot {
  if (input.fundedAmountUnits < 0n || input.committedLiabilityUnits < 0n) throw new Error('vault_amount_invalid');
  if (isPrizeVault(input.vaultType) && input.committedLiabilityUnits > input.fundedAmountUnits) throw new Error('prize_liability_exceeds_funding');
  if (!isPrizeVault(input.vaultType) && input.committedLiabilityUnits !== 0n) throw new Error('treasury_cannot_hold_prize_liability');
  return Object.freeze({ ...input, availableAmountUnits: input.fundedAmountUnits - input.committedLiabilityUnits });
}

export function isPrizeVault(vaultType: VaultType): vaultType is PrizeVaultType {
  return vaultType === 'MONTHLY_PRIZE' || vaultType === 'ANNUAL_JACKPOT' || vaultType === 'SCRATCH_RESERVE';
}

export function totalPrizeFunding(vaults: readonly VaultSnapshot[]): bigint {
  return vaults.filter((vault) => isPrizeVault(vault.vaultType)).reduce((sum, vault) => sum + vault.fundedAmountUnits, 0n);
}

export interface RenewalLiability {
  id: string;
  sourceTitleId: string;
  creditUnits: bigint;
  fundingSource: 'UNDECIDED' | 'GROWTH' | 'RENEWAL_RESERVE';
  funded: boolean;
  spendable: false;
  status: 'MODELED' | 'FUNDED' | 'REDEEMED' | 'EXPIRED';
}

export function createRenewalLiability(input: Omit<RenewalLiability, 'spendable'>): RenewalLiability {
  if (input.creditUnits < 0n) throw new Error('renewal_liability_invalid');
  if (input.fundingSource === 'UNDECIDED' && input.funded) throw new Error('renewal_funding_source_required');
  if (input.status === 'FUNDED' && !input.funded) throw new Error('renewal_liability_not_funded');
  return Object.freeze({ ...input, spendable: false });
}

export interface ScratchBatch {
  id: string;
  campaignId: string;
  tierId: string;
  titleCapacity: bigint;
  fundedPrizeUnits: bigint;
  maximumPrizeLiabilityUnits: bigint;
  issuedCount: bigint;
  status: 'DRAFT' | 'FUNDED' | 'ISSUING' | 'CLOSED';
}

export function createScratchBatch(input: ScratchBatch): ScratchBatch {
  if (input.titleCapacity <= 0n || input.fundedPrizeUnits < 0n || input.maximumPrizeLiabilityUnits < 0n || input.issuedCount < 0n) throw new Error('scratch_batch_amount_invalid');
  if (input.issuedCount > input.titleCapacity) throw new Error('scratch_batch_capacity_exceeded');
  if (input.maximumPrizeLiabilityUnits > input.fundedPrizeUnits) throw new Error('scratch_liability_exceeds_funding');
  return Object.freeze({ ...input });
}
