export type QuestStatus = 'LOCKED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'QUALIFIED' | 'CLAIMED' | 'UNAVAILABLE';

export interface CapTotalsDto {
  titleEntitlementUnits: string; humanClaimUnits: string; genesisGrowthUnits: string; otherFutureUnits: string;
  availableUnits: string; lockedUnits: string; spentUnits: string; burnedUnits: string; totalClaimedUnits: string; accountingMode: 'simulated';
}
export interface HumanClaimDto {
  available: boolean; reason: string | null; participation: 'NOT_CLAIMED' | 'REGISTERED' | 'SETTLED'; settledUnits: string;
  estimatedUnits: string | null; estimateLabel: 'ESTIMATE' | null;
  epoch: null | { id: string; calendarPeriod: string; status: 'DRAFT' | 'PUBLISHED' | 'OPEN' | 'CLOSED' | 'FINALIZED'; poolUnits: string; opensAt: string; closesAt: string; participantCount: string; settledUnitsPerHuman: string | null; unissuedRemainderUnits: string | null };
}
export interface QuestDto { questId: string; code: string; kind: string; verificationMode: 'INTERNAL' | 'EXTERNAL'; rewardUnits: string; status: QuestStatus; progressCurrent: string; progressRequired: string; reason: string | null }
export interface GenesisJourneyDto {
  campaign: null | { id: string; version: string; name: string; startsAt: string; endsAt: string; status: string; budgetUnits: string; distributedUnits: string; reservedUnits: string; remainingUnits: string; configCommitment: string };
  quests: QuestDto[]; humanClaim: HumanClaimDto; cap: CapTotalsDto; referralCode: string;
}
export interface PublicCapSummaryDto { generatedAt: string; accountingMode: 'simulated'; sources: Pick<CapTotalsDto, 'titleEntitlementUnits' | 'humanClaimUnits' | 'genesisGrowthUnits' | 'otherFutureUnits' | 'lockedUnits' | 'burnedUnits' | 'totalClaimedUnits'>; humanClaim: { calendarPeriod: string | null; status: string | null; poolUnits: string; participantCount: string; settledUnitsPerHuman: string | null; unissuedRemainderUnits: string | null }; genesis: { campaignId: string | null; version: string | null; budgetUnits: string; distributedUnits: string; remainingUnits: string } }
export interface FounderMetricsDto { generatedAt: string; humanClaim: { period: string | null; poolUnits: string; participants: string; settledUnits: string; unissuedUnits: string; projectedLiability2x: string; projectedLiability5x: string; projectedLiability10x: string }; genesis: { campaignId: string | null; budgetUnits: string; distributedUnits: string; reservedUnits: string; remainingUnits: string; participants: string; byQuest: Array<{ questId: string; qualified: string; claimed: string; distributedUnits: string }>; verifiedReferrals: string; milestoneQualifications: string; externalPending: string }; cap: CapTotalsDto; trust: { immutableLedgerRows: string; accountingMode: 'simulated'; productionTokenTransfers: false } }

function base(): string { return (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, ''); }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base()}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'CAP service unavailable');
  return body as T;
}
async function publicRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${base()}${path}`);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'Public trust data unavailable');
  return body as T;
}

export const GenesisCapApi = {
  journey: () => request<GenesisJourneyDto>('/api/cap/journey'),
  registerHumanClaim: () => request('/api/cap/human-claim/register', { method: 'POST', body: '{}' }),
  evaluateQuest: (questId: string) => request<QuestDto>(`/api/cap/genesis/quests/${encodeURIComponent(questId)}/evaluate`, { method: 'POST', body: '{}' }),
  claimQuest: (questId: string) => request(`/api/cap/genesis/quests/${encodeURIComponent(questId)}/claim`, { method: 'POST', body: '{}' }),
  registerReferral: (inviterCode: string) => request('/api/cap/genesis/referrals', { method: 'POST', body: JSON.stringify({ inviterCode }) }),
  createSocialPost: (body: string) => request<{ id: string; body: string; createdAt: string }>('/api/cap/genesis/social-posts', { method: 'POST', body: JSON.stringify({ body }) }),
  publicSummary: () => publicRequest<PublicCapSummaryDto>('/api/cap/fairness/summary'),
  founderMetrics: () => request<FounderMetricsDto>('/api/founder/control-center'),
};
