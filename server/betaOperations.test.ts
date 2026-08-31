import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { createRuntimePolicy, validateProviderReadiness } from './runtimePolicy.js';
import { createOperationalRouter } from './operationalHealth.js';
import { MemoryReconciliationStore, PaymentReconciliationWorker } from './paymentReconciliation.js';
import { DevelopmentMemoryEconomyRepository } from './economyRepository.js';
import { DevelopmentPaymentVerifier, createPaymentConfig } from './paymentVerifier.js';
import type { InternalUser } from './appSession.js';

const recipient = '0x1111111111111111111111111111111111111111';
const appId = 'app_beta_test';

test('beta runtime fails closed on development capabilities and missing providers', () => {
  assert.throws(() => createRuntimePolicy({ NODE_ENV: 'production', WORLDPRIZE_ENV: 'beta', ENABLE_DEV_DRAW_RANDOMNESS: 'true' }), /development_capability_forbidden/);
  const policy = createRuntimePolicy({ NODE_ENV: 'production', WORLDPRIZE_ENV: 'beta', ENABLE_BETA_DEMO_PURCHASES: 'true' });
  assert.equal(policy.allowDemoPurchases, true);
  assert.deepEqual(validateProviderReadiness(policy, {}), ['WORLD_CHAIN_SEPOLIA_RPC_URL', 'WITNET_RANDOMNESS_CONTRACT', 'DRAW_COMMITMENT_REGISTRY_ADDRESS']);
  assert.deepEqual(validateProviderReadiness(policy, {
    WORLD_CHAIN_SEPOLIA_RPC_URL: 'https://worldchain-sepolia.g.alchemy.com/public', WITNET_NETWORK: 'world-chain-sepolia', WORLD_CHAIN_CHAIN_ID: '4801',
    WITNET_RANDOMNESS_CONTRACT: `0x${'0'.repeat(40)}`, DRAW_COMMITMENT_REGISTRY_ADDRESS: `0x${'0'.repeat(40)}`,
  }), ['WITNET_RANDOMNESS_CONTRACT', 'DRAW_COMMITMENT_REGISTRY_ADDRESS']);
});

test('demo purchase mode cannot activate in production', () => {
  assert.throws(() => createRuntimePolicy({ NODE_ENV: 'production', WORLDPRIZE_ENV: 'production', ENABLE_BETA_DEMO_PURCHASES: 'true' }), /production_demo_purchase_forbidden/);
  assert.equal(createPaymentConfig({ WORLDPRIZE_ENV: 'production', WORLD_APP_ID: appId, WORLDPRIZE_PAYMENT_RECIPIENT: recipient, WORLD_DEVELOPER_API_KEY: 'x'.repeat(32), ENABLE_BETA_DEMO_PURCHASES: 'true' }), null);
});

test('health and readiness distinguish liveness from dependencies', async () => {
  const app = express(); app.use(createOperationalRouter({ runtime: 'beta', configurationValid: true, persistenceConfigured: true, providerConfigurationMissing: ['WITNET_RANDOMNESS_CONTRACT'], probePersistence: async () => true }));
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address === 'object');
  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/health`); assert.equal(health.status, 200);
    const ready = await fetch(`http://127.0.0.1:${address.port}/ready`); assert.equal(ready.status, 503); assert.equal((await ready.json() as { ready: boolean }).ready, false);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('payment reconciliation is idempotent after a late confirmation', async () => {
  const repository = new DevelopmentMemoryEconomyRepository();
  const user: InternalUser = { id: `user_${'a'.repeat(64)}`, username: 'Human_AAAAAAAA' };
  const config = createPaymentConfig({ WORLDPRIZE_ENV: 'development', WORLD_APP_ID: appId, WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'true' }); assert(config);
  const intent = await repository.createPurchaseIntent(user, '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 1, recipient);
  const store = new MemoryReconciliationStore([{ user, reference: intent.reference, transactionId: 'devtx_11111111-1111-4111-8111-111111111111', attempts: 0, status: 'pending', lastError: null }]);
  const worker = new PaymentReconciliationWorker(store, repository, new DevelopmentPaymentVerifier(config));
  assert.equal((await worker.runOnce()).completed, 1); assert.equal(repository.purchases.size, 1);
  assert.equal((await worker.runOnce()).processed, 0); assert.equal(repository.purchases.size, 1);
});
