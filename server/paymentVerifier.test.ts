import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTIVE_CAMPAIGN_ID, PURPLE_TIER_ID, TITLE_PRICE_UNITS, type PurchaseIntentRecord, type VerifiedPayment } from './economyTypes.js';
import { assertVerifiedPayment, createPaymentConfig, type PaymentConfig } from './paymentVerifier.js';

const recipient = '0x000000000000000000000000000000000000dead';
const config: PaymentConfig = { runtime: 'production', appId: 'app_worldprize_live', recipient, developerApiKey: 'a'.repeat(32), fakePaymentsEnabled: false };
const intent: PurchaseIntentRecord = { reference: '11111111-1111-4111-8111-111111111111', userId: `user_${'a'.repeat(64)}`, campaignId: ACTIVE_CAMPAIGN_ID, tierId: PURPLE_TIER_ID, quantity: 1, unitPriceUnits: TITLE_PRICE_UNITS, totalUnits: TITLE_PRICE_UNITS, recipient, token: 'WLD', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-08-31T00:00:00.000Z', completedPurchaseId: null, transactionId: null };
const verified: VerifiedPayment = { transactionId: 'transaction_1', transactionHash: `0x${'b'.repeat(64)}`, reference: intent.reference, transactionStatus: 'mined', from: '0x000000000000000000000000000000000000beef', chain: 'worldchain', tokenAmount: TITLE_PRICE_UNITS.toString(), token: 'WLD', to: recipient, appId: config.appId, timestamp: '2026-08-31T00:00:00.000Z' };

describe('World Pay verification boundary', () => {
  it('accepts only a fully matching mined WLD payment', () => assert.doesNotThrow(() => assertVerifiedPayment(verified, intent, config)));
  it('rejects reference, chain, app and sender mismatches', () => {
    assert.throws(() => assertVerifiedPayment({ ...verified, reference: crypto.randomUUID() }, intent, config), /payment_reference_mismatch/);
    assert.throws(() => assertVerifiedPayment({ ...verified, chain: 'other' as 'worldchain' }, intent, config), /payment_wrong_chain/);
    assert.throws(() => assertVerifiedPayment({ ...verified, appId: 'app_other' }, intent, config), /payment_wrong_app/);
    assert.throws(() => assertVerifiedPayment({ ...verified, from: 'not-an-address' }, intent, config), /payment_invalid_sender/);
  });
  it('requires explicit fake payments in development and forbids them elsewhere', () => {
    assert.ok(createPaymentConfig({ WORLDPRIZE_ENV: 'development', WORLD_APP_ID: 'app_worldprize_dev', WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'true' } as NodeJS.ProcessEnv));
    assert.equal(createPaymentConfig({ WORLDPRIZE_ENV: 'production', WORLD_APP_ID: 'app_worldprize_live', WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'true', WORLD_DEVELOPER_API_KEY: 'a'.repeat(32) } as NodeJS.ProcessEnv), null);
    assert.ok(createPaymentConfig({ WORLDPRIZE_ENV: 'testnet', WORLD_APP_ID: 'app_worldprize_test', WORLDPRIZE_PAYMENT_RECIPIENT: recipient, ENABLE_DEV_FAKE_PAYMENTS: 'false' } as NodeJS.ProcessEnv));
  });
});
