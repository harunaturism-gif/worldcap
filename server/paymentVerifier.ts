import type { PurchaseIntentRecord, VerifiedPayment } from './economyTypes.js';
import { parseUnitString } from './tokenUnits.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

export interface PaymentConfig {
  runtime: 'development' | 'beta' | 'testnet' | 'production';
  appId: string;
  recipient: string;
  developerApiKey?: string;
  fakePaymentsEnabled: boolean;
  betaDemoEnabled?: boolean;
}

export interface PaymentVerifier {
  verify(transactionId: string, intent: PurchaseIntentRecord): Promise<VerifiedPayment>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createPaymentConfig(environment: NodeJS.ProcessEnv): PaymentConfig | null {
  const runtime = environment.WORLDPRIZE_ENV;
  const appId = environment.WORLD_APP_ID;
  const recipient = environment.WORLDPRIZE_PAYMENT_RECIPIENT;
  const developerApiKey = environment.WORLD_DEVELOPER_API_KEY;
  const fakePaymentsEnabled = environment.ENABLE_DEV_FAKE_PAYMENTS === 'true';
  const betaDemoEnabled = environment.ENABLE_BETA_DEMO_PURCHASES === 'true';
  if (runtime !== 'development' && runtime !== 'beta' && runtime !== 'testnet' && runtime !== 'production') return null;
  if (!appId || !/^app_[A-Za-z0-9_-]{4,}$/.test(appId) || !recipient || !ADDRESS_PATTERN.test(recipient)) return null;
  if (runtime === 'development') {
    if (!fakePaymentsEnabled || developerApiKey) return null;
  } else if (runtime === 'beta') {
    if (fakePaymentsEnabled || (betaDemoEnabled ? Boolean(developerApiKey) : !developerApiKey || developerApiKey.length < 24)) return null;
  } else if (runtime === 'testnet') {
    if (fakePaymentsEnabled || developerApiKey) return null;
  } else if (fakePaymentsEnabled || betaDemoEnabled || !developerApiKey || developerApiKey.length < 24 || developerApiKey !== developerApiKey.trim()) return null;
  return { runtime, appId, recipient: recipient.toLowerCase(), developerApiKey, fakePaymentsEnabled, betaDemoEnabled };
}

export function assertVerifiedPayment(payment: VerifiedPayment, intent: PurchaseIntentRecord, config: PaymentConfig): void {
  if (payment.reference !== intent.reference) throw new Error('payment_reference_mismatch');
  if (payment.transactionStatus !== 'mined') throw new Error('payment_not_final');
  if (payment.chain !== 'worldchain') throw new Error('payment_wrong_chain');
  if (payment.token !== 'WLD') throw new Error('payment_wrong_asset');
  if (payment.to.toLowerCase() !== intent.recipient.toLowerCase() || payment.to.toLowerCase() !== config.recipient) throw new Error('payment_wrong_recipient');
  if (payment.appId !== config.appId) throw new Error('payment_wrong_app');
  if (parseUnitString(payment.tokenAmount) !== intent.totalUnits) throw new Error('payment_wrong_amount');
  if (!ADDRESS_PATTERN.test(payment.from)) throw new Error('payment_invalid_sender');
}

export class DevelopmentPaymentVerifier implements PaymentVerifier {
  constructor(private readonly config: PaymentConfig) {
    if (config.runtime !== 'development' || !config.fakePaymentsEnabled) throw new Error('Development payments are disabled');
  }

  async verify(transactionId: string, intent: PurchaseIntentRecord): Promise<VerifiedPayment> {
    if (!/^devtx_[0-9a-f-]{36}$/.test(transactionId)) throw new Error('invalid_development_transaction');
    return {
      transactionId,
      transactionHash: `0x${transactionId.slice(6).replaceAll('-', '').padEnd(64, '0')}`,
      reference: intent.reference,
      transactionStatus: 'mined',
      from: '0xDeaD00000000000000000000000000000000BEEF',
      chain: 'worldchain',
      tokenAmount: intent.totalUnits.toString(),
      token: 'WLD',
      to: intent.recipient,
      appId: this.config.appId,
      timestamp: new Date().toISOString(),
    };
  }
}

export class WorldDeveloperPaymentVerifier implements PaymentVerifier {
  constructor(private readonly config: PaymentConfig) {
    if (config.runtime !== 'production' || !config.developerApiKey) throw new Error('Real payment verification is unavailable');
  }

  async verify(transactionId: string): Promise<VerifiedPayment> {
    if (!TRANSACTION_ID_PATTERN.test(transactionId)) throw new Error('invalid_transaction_id');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = new URL(`https://developer.world.org/api/v2/minikit/transaction/${encodeURIComponent(transactionId)}`);
      url.searchParams.set('app_id', this.config.appId);
      url.searchParams.set('type', 'payment');
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.developerApiKey}` }, signal: controller.signal });
      if (!response.ok) { await response.body?.cancel(); throw new Error('payment_verification_rejected'); }
      const value: unknown = await response.json();
      if (!isRecord(value)
        || typeof value.reference !== 'string' || typeof value.transaction_hash !== 'string'
        || value.transaction_status !== 'mined' || typeof value.from !== 'string'
        || value.chain !== 'worldchain' || typeof value.timestamp !== 'string'
        || typeof value.token_amount !== 'string' || value.token !== 'WLD'
        || typeof value.to !== 'string' || typeof value.app_id !== 'string') throw new Error('invalid_payment_verification_response');
      return {
        transactionId, transactionHash: value.transaction_hash, reference: value.reference,
        transactionStatus: value.transaction_status, from: value.from, chain: value.chain,
        timestamp: value.timestamp, tokenAmount: value.token_amount, token: value.token,
        to: value.to, appId: value.app_id,
      };
    } catch (error) {
      if (error instanceof Error && (error.message === 'payment_verification_rejected' || error.message === 'invalid_payment_verification_response' || error.message === 'invalid_transaction_id')) throw error;
      throw new Error(controller.signal.aborted ? 'payment_verification_timeout' : 'payment_verification_unavailable');
    } finally { clearTimeout(timeout); }
  }
}

export class DisabledPaymentVerifier implements PaymentVerifier {
  async verify(): Promise<VerifiedPayment> { throw new Error('world_pay_testnet_is_not_supported'); }
}

export class BetaDemoPaymentVerifier implements PaymentVerifier {
  constructor(private readonly config: PaymentConfig) {
    if (config.runtime !== 'beta' || !config.betaDemoEnabled || config.fakePaymentsEnabled || config.developerApiKey) throw new Error('Beta demo purchases are disabled');
  }
  async verify(transactionId: string, intent: PurchaseIntentRecord): Promise<VerifiedPayment> {
    if (!/^demotx_[0-9a-f-]{36}$/.test(transactionId)) throw new Error('invalid_beta_demo_transaction');
    return {
      transactionId, transactionHash: `0x${transactionId.slice(7).replaceAll('-', '').padEnd(64, '0')}`,
      reference: intent.reference, transactionStatus: 'mined', from: '0x000000000000000000000000000000000000dEaD',
      chain: 'worldchain', tokenAmount: intent.totalUnits.toString(), token: 'WLD', to: intent.recipient,
      appId: this.config.appId, timestamp: new Date().toISOString(), settlementMode: 'demo',
    };
  }
}
