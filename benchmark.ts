import { performance } from 'perf_hooks';

// Setup mock data
const N = 100000;
const ledger = Array.from({ length: N }, (_, i) => ({
  classification: i % 2 === 0 ? 'verified_purchase' : 'other',
  amountUnits: i.toString(),
}));

const runs = 100;

function runBaseline() {
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    ledger.filter((entry) => entry.classification === 'verified_purchase').reduce((sum, entry) => sum + BigInt(entry.amountUnits), 0n);
  }
  return performance.now() - start;
}

function runOptimized() {
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    ledger.reduce((sum, entry) => entry.classification === 'verified_purchase' ? sum + BigInt(entry.amountUnits) : sum, 0n);
  }
  return performance.now() - start;
}

// Warmup
runBaseline();
runOptimized();

const baselineTime = runBaseline();
const optimizedTime = runOptimized();

console.log(`Baseline time: ${baselineTime.toFixed(2)}ms`);
console.log(`Optimized time: ${optimizedTime.toFixed(2)}ms`);
console.log(`Improvement: ${(((baselineTime - optimizedTime) / baselineTime) * 100).toFixed(2)}%`);
