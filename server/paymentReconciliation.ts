import type { InternalUser } from './appSession.js';
import type { EconomyRepository } from './economyRepository.js';
import type { PaymentVerifier } from './paymentVerifier.js';
import { operationalLog } from './structuredLogger.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PersistenceConfig } from './config.js';

export interface ReconciliationIntent { user: InternalUser; reference: string; transactionId: string; attempts: number; status: 'pending' | 'completed' | 'failed' | 'stuck'; lastError: string | null }
export interface ReconciliationStore { listPending(limit: number): Promise<ReconciliationIntent[]>; save(intent: ReconciliationIntent): Promise<void> }
export interface ReconciliationQueue { enqueue(user: InternalUser, reference: string, transactionId: string): Promise<void> }

export class PaymentReconciliationWorker {
  constructor(private readonly store: ReconciliationStore, private readonly economy: EconomyRepository, private readonly verifier: PaymentVerifier, private readonly maxAttempts = 8) {}
  async runOnce(limit = 25): Promise<{ processed: number; completed: number; stuck: number }> {
    const pending = await this.store.listPending(limit); let completed = 0; let stuck = 0;
    for (const job of pending) {
      try {
        const intent = await this.economy.getPurchaseIntent(job.user.id, job.reference);
        if (!intent) throw new Error('purchase_intent_not_found');
        if (intent.status === 'completed') { job.status = 'completed'; completed += 1; }
        else { const payment = await this.verifier.verify(job.transactionId, intent); await this.economy.completePurchase(job.user, intent, payment); job.status = 'completed'; completed += 1; }
        job.lastError = null;
      } catch (error) {
        job.attempts += 1; job.lastError = error instanceof Error ? error.message : 'unknown_reconciliation_failure';
        job.status = job.attempts >= this.maxAttempts ? 'stuck' : 'pending'; if (job.status === 'stuck') stuck += 1;
      }
      await this.store.save(job);
      operationalLog('reconciliation', { reference: job.reference, status: job.status, attempt: job.attempts, reason: job.lastError ?? undefined });
    }
    return { processed: pending.length, completed, stuck };
  }
}

export class MemoryReconciliationStore implements ReconciliationStore {
  constructor(readonly jobs: ReconciliationIntent[] = []) {}
  async listPending(limit: number) { return this.jobs.filter((job) => job.status === 'pending').slice(0, limit); }
  async save(intent: ReconciliationIntent) { const index = this.jobs.findIndex((job) => job.reference === intent.reference); if (index >= 0) this.jobs[index] = { ...intent }; }
}

export class SupabaseReconciliationStore implements ReconciliationStore, ReconciliationQueue {
  constructor(private readonly client: SupabaseClient, private readonly workerId: string) {
    if (!/^[A-Za-z0-9._:-]{3,100}$/.test(workerId)) throw new Error('reconciliation_worker_id_invalid');
  }
  async enqueue(user: InternalUser, reference: string, transactionId: string) {
    const intent = await this.client.from('purchase_intents').select('user_id').eq('reference', reference).eq('user_id', user.id).maybeSingle();
    if (intent.error || !intent.data) throw new Error('purchase_intent_not_found');
    const inserted = await this.client.from('payment_reconciliation_jobs').insert({ purchase_reference: reference, transaction_id: transactionId });
    if (!inserted.error) return;
    const existing = await this.client.from('payment_reconciliation_jobs').select('transaction_id').eq('purchase_reference', reference).maybeSingle();
    if (existing.error || !existing.data || existing.data.transaction_id !== transactionId) throw new Error('reconciliation_transaction_conflict');
  }
  async listPending(limit: number) {
    const claimed = await this.client.rpc('worldcap_claim_reconciliation_jobs', { p_worker: this.workerId, p_limit: limit });
    if (claimed.error) throw new Error('reconciliation_claim_failed');
    const rows = (claimed.data ?? []) as Array<Record<string, unknown>>;
    const references = rows.map((row) => String(row.purchase_reference));
    if (references.length === 0) return [];
    const intents = await this.client.from('purchase_intents').select('reference,user_id').in('reference', references);
    if (intents.error) throw new Error('reconciliation_intent_read_failed');
    const users = new Map((intents.data ?? []).map((row) => [row.reference, row.user_id]));
    return rows.map((row): ReconciliationIntent => {
      const reference = String(row.purchase_reference); const userId = users.get(reference);
      if (!userId) throw new Error('reconciliation_intent_missing');
      const attemptCount = Number(row.attempt_count);
      if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) throw new Error('reconciliation_attempt_invalid');
      return { user: { id: userId, username: `Human_${userId.slice(-8).toUpperCase()}` }, reference, transactionId: String(row.transaction_id), attempts: attemptCount - 1, status: 'pending', lastError: typeof row.last_error_code === 'string' ? row.last_error_code : null };
    });
  }
  async save(intent: ReconciliationIntent) {
    const status = intent.status === 'pending' ? 'failed' : intent.status;
    const delaySeconds = Math.min(900, 2 ** Math.min(intent.attempts, 9));
    const update: Record<string, unknown> = {
      status, attempt_count: intent.attempts, last_error_code: intent.lastError,
      locked_at: null, locked_by: null, updated_at: new Date().toISOString(),
    };
    if (status === 'failed') update.next_attempt_at = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const saved = await this.client.from('payment_reconciliation_jobs').update(update).eq('purchase_reference', intent.reference).eq('transaction_id', intent.transactionId);
    if (saved.error) throw new Error('reconciliation_save_failed');
  }
}

export function createSupabaseReconciliationStore(config: PersistenceConfig, workerId: string) {
  if (config.mode !== 'supabase' || !config.supabaseUrl || !config.serviceRoleKey) throw new Error('Invalid Supabase configuration');
  return new SupabaseReconciliationStore(createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'worldcap-payment-reconciliation' } },
  }), workerId);
}
