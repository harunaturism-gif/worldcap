import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core';
import { MiniKit } from '@worldcoin/minikit-js';
import type { AppSession } from '../domains/identity/types';

const WORLD_SESSION_STORAGE_KEY = 'worldprize:world-session-id';
const WORLD_SESSION_PATTERN = /^session_[0-9a-fA-F]{128}$/;
const USER_ID_PATTERN = /^user_[0-9a-f]{64}$/;
const USERNAME_PATTERN = /^Human_[0-9A-F]{8}$/;

interface RpContextResponse {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  sig: string;
}

function backendUrl(): string {
  return (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

function isAuthUser(value: unknown): value is AppSession['user'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string' && USER_ID_PATTERN.test(user.id) && typeof user.username === 'string' && USERNAME_PATTERN.test(user.username);
}

function isRpContext(value: unknown): value is RpContextResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return typeof context.rp_id === 'string' && /^rp_[A-Za-z0-9_-]{4,}$/.test(context.rp_id)
    && typeof context.nonce === 'string' && context.nonce.length > 0
    && Number.isSafeInteger(context.created_at) && Number.isSafeInteger(context.expires_at)
    && typeof context.sig === 'string' && context.sig.length > 0;
}

function isDevelopmentBypass(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_AUTH === 'true';
}

async function existingApplicationSession(): Promise<AppSession | null> {
  try {
    const response = await fetch(`${backendUrl()}/api/auth/session`, { credentials: 'include' });
    if (!response.ok) return null;
    const data = await response.json() as { user?: unknown };
    return isAuthUser(data.user) ? { user: data.user, mode: 'world-id' } : null;
  } catch (error) {
    if (import.meta.env.DEV) console.error('AuthService existingApplicationSession error:', error);
    return null;
  }
}

export const AuthService = {
  isDevelopmentBypass,
  isWorldApp(): boolean { return MiniKit.isInstalled(); },

  async authenticate(): Promise<AppSession | null> {
    if (isDevelopmentBypass()) {
      try {
        const response = await fetch(`${backendUrl()}/api/auth/dev-session`, { method: 'POST', credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json() as { user?: unknown };
        return isAuthUser(data.user) ? { user: data.user, mode: 'development' } : null;
      } catch (error) {
        if (import.meta.env.DEV) console.error('AuthService dev authenticate error:', error);
        return null;
      }
    }

    const restored = await existingApplicationSession();
    if (restored) return restored;
    if (!MiniKit.isInstalled()) return null;

    try {
      const contextResponse = await fetch(`${backendUrl()}/api/auth/session-rp-context`, { method: 'POST', credentials: 'include' });
      if (!contextResponse.ok) return null;
      const contextData: unknown = await contextResponse.json();
      if (!isRpContext(contextData)) return null;

      const appId = import.meta.env.VITE_WORLD_APP_ID;
      if (typeof appId !== 'string' || !/^app_[A-Za-z0-9_-]+$/.test(appId)) return null;
      const config = {
        app_id: appId as `app_${string}`,
        rp_context: {
          rp_id: contextData.rp_id,
          nonce: contextData.nonce,
          created_at: contextData.created_at,
          expires_at: contextData.expires_at,
          signature: contextData.sig,
        },
        environment: 'production' as const,
      };

      const storedSessionId = localStorage.getItem(WORLD_SESSION_STORAGE_KEY);
      const builder = storedSessionId && WORLD_SESSION_PATTERN.test(storedSessionId)
        ? IDKit.proveSession(storedSessionId as `session_${string}`, config)
        : IDKit.createSession(config);
      const request = await builder.constraints(any(CredentialRequest('proof_of_human')));
      const result = await request.pollUntilCompletion();
      if (!result?.success || !result.result) return null;

      const proof = result.result;
      if ('session_id' in proof && typeof proof.session_id === 'string' && WORLD_SESSION_PATTERN.test(proof.session_id)) {
        localStorage.setItem(WORLD_SESSION_STORAGE_KEY, proof.session_id);
      }

      const verifyResponse = await fetch(`${backendUrl()}/api/auth/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof }),
      });
      if (!verifyResponse.ok) return null;
      const authData = await verifyResponse.json() as { verified?: unknown; user?: unknown };
      return authData.verified === true && isAuthUser(authData.user) ? { user: authData.user, mode: 'world-id' } : null;
    } catch (error) {
      if (import.meta.env.DEV) console.error('AuthService authenticate error:', error);
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${backendUrl()}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (error) {
      if (import.meta.env.DEV) console.error('AuthService logout error:', error);
      /* fail locally */
    }
  },
};
