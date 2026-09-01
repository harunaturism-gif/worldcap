export type OperationalEvent = 'auth_failure' | 'payment_confirmation' | 'draw_closure' | 'manifest_publication' | 'manifest_publication_failure' | 'randomness_request' | 'randomness_fulfillment' | 'randomness_coordinator_failure' | 'draw_resolution' | 'verification_failure' | 'reconciliation' | 'background_worker_failure' | 'human_claim_registration' | 'founder_access_denied';
const SAFE_KEYS = new Set(['drawId', 'epochId', 'purchaseId', 'reference', 'requestId', 'provider', 'status', 'attempt', 'reason', 'runtime', 'replayed']);

export function operationalLog(event: OperationalEvent, fields: Record<string, unknown> = {}): string {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) => SAFE_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)));
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level: event.endsWith('failure') ? 'warn' : 'info', event, ...safe });
  console.log(line);
  return line;
}
