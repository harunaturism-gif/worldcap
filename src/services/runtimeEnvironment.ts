import { MiniKit } from '@worldcoin/minikit-js';

export interface ClientCapabilities { environment: 'world-app' | 'standard-browser'; canUseWorldPay: boolean; canReadFairness: true; canViewCollection: boolean }

export function detectClientCapabilities(authenticated: boolean): ClientCapabilities {
  const insideWorldApp = MiniKit.isInstalled();
  return { environment: insideWorldApp ? 'world-app' : 'standard-browser', canUseWorldPay: insideWorldApp, canReadFairness: true, canViewCollection: authenticated };
}
