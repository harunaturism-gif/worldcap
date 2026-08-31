# WorldCAP Adversarial Review Report
Branch: feat/beta-technical-vertical
Target HEAD: 34c62689f83dd151217d2fecab7943ef73fd811d

## Executive Summary
An adversarial review of the closed technical beta trust loop was conducted, preserving the specified branch without mutation. The review examined payment reconciliation, atomic draw closure, Witnet bindings, commitment anchoring, and worker idempotency.

The most critical finding is an architectural divergence: **the requested Phase 3A ancestor is missing from this branch's history**, meaning it was likely branched incorrectly or completely rewritten.

Several medium-severity defense-in-depth and architectural constraints were also identified, primarily revolving around reliance on external state for idempotency, strict API key enforcement in Beta, and minor data integrity checks in worker loops.

---

## 1. Topological Ancestry (Critical)

**Severity:** Critical
**Status:** External blocker
**Affected Component:** Repository Git History

**Failure Scenario:**
The prompt strictly required preserving topological ancestry from the frozen Phase 3A ancestor (`aa6c1d5e4cf61f7b68658fdad7bdc434f5e069a1`).

**Reproduction Evidence:**
```bash
$ git merge-base --is-ancestor aa6c1d5e4cf61f7b68658fdad7bdc434f5e069a1 HEAD && echo "VALID" || echo "MISSING"
MISSING
```
**Impact:**
The branch was incorrectly created (e.g., branched from a stale main or commits were cherry-picked instead of branching from the base SHA). Merging this will violate the project's strict Git Branching & Ancestry rules.

**Recommended Remediation:**
Rebase or recreate the `feat/beta-technical-vertical` branch strictly originating from `aa6c1d5e4cf61f7b68658fdad7bdc434f5e069a1`, applying the required file modifications manually to preserve topological history.

---

## 2. Payment Reconciliation and Idempotency

**Severity:** Medium
**Status:** Defense-in-depth
**Affected Component:** `server/paymentReconciliation.ts`

**Failure Scenario:**
The `PaymentReconciliationWorker` processes pending jobs by verifying the payment against the intent and then calling `completePurchase()`. The worker loop itself operates linearly. In `SupabaseReconciliationStore.enqueue`, it enforces that only one transaction ID can be bound to a given purchase reference.
However, `completePurchase()` is the ultimate source of idempotency. If `completePurchase` fails (e.g. transient DB issue) after the payment is verified, the worker sets status to `failed` and will retry on the next loop. This is mostly safe due to `worldprize_complete_purchase` RPC's internal guards. However, `paymentReconciliation.ts` assumes the database gracefully handles concurrent attempts without double issuance.

**Reproduction Evidence:**
`SupabaseEconomyRepository.completePurchase` handles double completion by catching RPC errors containing `purchase_reference_consumed` or `payment_transaction_consumed`.

**Impact:**
Because idempotency relies entirely on the underlying Postgres RPC strings matching (`purchase_reference_consumed`), if the RPC string changes, the worker might misinterpret it as an unexpected failure and keep retrying endlessly, eventually becoming `stuck`.

**Recommended Remediation:**
Use strong application-level idempotency status checks (e.g., `intent.status === 'completed'`) immediately before attempting `completePurchase`, which is currently partially done, but should explicitly ensure `completedPurchaseId` is checked defensively.

---

## 3. Payment Verifier Constraints

**Severity:** Medium
**Status:** Defense-in-depth
**Affected Component:** `server/paymentVerifier.ts`

**Failure Scenario:**
The logic in `createPaymentConfig` allows `betaDemoEnabled` mode. The condition reads:
`if (fakePaymentsEnabled || (betaDemoEnabled ? Boolean(developerApiKey) : !developerApiKey || developerApiKey.length < 24)) return null;`
This means if `betaDemoEnabled` is true, the `developerApiKey` MUST NOT be provided (`Boolean(developerApiKey)` must be false). This forces the beta demo environment to completely discard the ability to do real API-based verifications alongside demo payments.

**Reproduction Evidence:**
`server/paymentVerifier.ts:36`.

**Impact:**
A beta environment cannot simultaneously process real WLD payments and demo purchases if a single `PaymentConfig` is enforced, as the presence of the developer key invalidates the configuration.

**Recommended Remediation:**
Ensure the configuration strictly splits "beta demo" (no API key, simulated backend) from a "beta real" environment, or clarify if hybrid testing is needed.

---

## 4. Draw Closure and Anchor Verification

**Severity:** Informational
**Status:** Confirmed defect
**Affected Component:** `server/verifyDrawV2.ts`

**Failure Scenario:**
`verifyDrawV2` heavily relies on matching the stored `draw.randomnessSeed` to recompute the winner.
```typescript
  if (algorithmVerified && manifestVerified && draw.randomnessSeed) {
    winningIndex = selectWinningIndex(parseRandomnessSeed(draw.randomnessSeed), BigInt(artifact.entries.length));
    winner = artifact.entries[Number(winningIndex)] ?? null;
  }
```
If an administrator mutates the `draw.winningTitleId` manually in the DB but leaves the `randomnessSeed` intact, `verifyDrawV2` correctly recomputes the winner and detects the mismatch (`winnerVerified` becomes false).

**Impact:**
The `verifyDrawV2` acts correctly as an independent verifier. However, the system fundamentally trusts the DB state for `draw.randomnessSeed`. If an attacker can alter the seed AND the winning title simultaneously, verification might pass on the altered data (unless anchored). The anchor verification mitigates this by tying it to the on-chain registry, but if `anchorRequired` is false, it downgrades securely.

**Recommended Remediation:**
Ensure `anchorRequired` is enforced strictly in production to prevent DB-level seed and winner manipulation.

---

## 5. Silenced Catch Blocks

**Severity:** Low
**Status:** Confirmed defect
**Affected Components:** Frontend and backend catch blocks.

**Failure Scenario:**
The system explicitly requested avoiding silenced catch blocks in client services, but `src/services/authService.ts`, `src/services/economyApi.ts`, and `src/store/mvpStore.tsx` contain `catch { ... }` or `.catch(() => ({}))` that return fallback values without conditionally logging `import.meta.env.DEV` to the console.

**Impact:**
Reduces local observability and breaks project guidelines.

**Recommended Remediation:**
Change `catch { return null; }` to `catch (error) { if (import.meta.env.DEV) console.error(error); return null; }`.
