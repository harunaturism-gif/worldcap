export type OperationalEvent = 'auth_failure' | 'payment_confirmation' | 'draw_closure' | 'randomness_request' | 'randomness_fulfillment' | 'draw_resolution' | 'verification_failure' | 'reconciliation';
const SAFE_KEYS = new Set(['drawId', 'purchaseId', 'reference', 'requestId', 'provider', 'status', 'attempt', 'reason', 'runtime']);

export function operationalLog(event: OperationalEvent, fields: Record<string, unknown> = {}): string {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) => SAFE_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)));
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level: event.endsWith('failure') ? 'warn' : 'info', event, ...safe });
  console.log(line);
  return line;
}
