import type { InternalUser } from './appSession.js';
import type { EconomyRepository } from './economyRepository.js';
import type { PaymentVerifier } from './paymentVerifier.js';
import { operationalLog } from './structuredLogger.js';

export interface ReconciliationIntent { user: InternalUser; reference: string; transactionId: string; attempts: number; status: 'pending' | 'completed' | 'failed' | 'stuck'; lastError: string | null }
export interface ReconciliationStore { listPending(limit: number): Promise<ReconciliationIntent[]>; save(intent: ReconciliationIntent): Promise<void> }

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
