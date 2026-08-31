import { createHmac, randomUUID } from 'node:crypto';
import jsonwebtoken from 'jsonwebtoken';

const { sign, verify } = jsonwebtoken;
export const APP_SESSION_ISSUER = 'worldprize-server';
export const APP_SESSION_AUDIENCE = 'worldprize-web';
export const APP_SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const PRODUCTION_COOKIE = '__Host-worldprize_session';
const DEVELOPMENT_COOKIE = 'worldprize_session_dev';
const WORLD_SESSION_PATTERN = /^session_[0-9a-fA-F]{128}$/;
const USER_ID_PATTERN = /^user_[0-9a-f]{64}$/;
const USERNAME_PATTERN = /^Human_[0-9A-F]{8}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const JWT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_KEYS = ['aud', 'exp', 'iat', 'iss', 'jti', 'sub', 'username'];

export interface InternalUser { id: string; username: string }
export interface AppSessionConfig { appOrigin: string; identitySecret: string; isProduction: boolean; sessionSecret: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function usernameForUserId(id: string) { return `Human_${id.slice(-8).toUpperCase()}`; }

export function isValidApplicationSecret(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  const bytes = Buffer.from(value, 'utf8');
  return bytes.length >= 32 && new Set(bytes).size >= 8;
}

export function createAppSessionConfig(environment: NodeJS.ProcessEnv): AppSessionConfig | null {
  const { APP_SESSION_SECRET: sessionSecret, APP_IDENTITY_SECRET: identitySecret, APP_ORIGIN: appOrigin } = environment;
  const isProduction = environment.NODE_ENV !== 'development';
  if (!isValidApplicationSecret(sessionSecret) || !isValidApplicationSecret(identitySecret) || sessionSecret === identitySecret || !appOrigin || appOrigin !== appOrigin.trim()) return null;
  try {
    const parsed = new URL(appOrigin);
    if (parsed.origin !== appOrigin || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || (isProduction && parsed.protocol !== 'https:')) return null;
  } catch { return null; }
  return { appOrigin, identitySecret, isProduction, sessionSecret };
}

export function deriveInternalUser(worldSessionId: string, identitySecret: string): InternalUser {
  if (!WORLD_SESSION_PATTERN.test(worldSessionId) || !isValidApplicationSecret(identitySecret)) throw new Error('Invalid identity derivation input');
  const digest = createHmac('sha256', identitySecret).update(worldSessionId, 'utf8').digest('hex');
  const id = `user_${digest}`;
  return { id, username: usernameForUserId(id) };
}

export function signApplicationSession(user: InternalUser, sessionSecret: string): string {
  if (!USER_ID_PATTERN.test(user.id) || user.username !== usernameForUserId(user.id) || !isValidApplicationSecret(sessionSecret)) throw new Error('Invalid application session input');
  return sign({ username: user.username }, sessionSecret, { algorithm: 'HS256', audience: APP_SESSION_AUDIENCE, expiresIn: APP_SESSION_LIFETIME_SECONDS, issuer: APP_SESSION_ISSUER, jwtid: randomUUID(), subject: user.id });
}

export function verifyApplicationSession(token: string, sessionSecret: string, now = Math.floor(Date.now() / 1000)): InternalUser | null {
  if (!JWT_PATTERN.test(token) || !isValidApplicationSecret(sessionSecret)) return null;
  try {
    const payload = verify(token, sessionSecret, { algorithms: ['HS256'], audience: APP_SESSION_AUDIENCE, clockTimestamp: now, issuer: APP_SESSION_ISSUER });
    if (!isRecord(payload) || Object.keys(payload).sort().join(',') !== EXPECTED_KEYS.join(',')) return null;
    if (typeof payload.sub !== 'string' || !USER_ID_PATTERN.test(payload.sub) || typeof payload.username !== 'string' || !USERNAME_PATTERN.test(payload.username) || payload.username !== usernameForUserId(payload.sub)) return null;
    if (typeof payload.jti !== 'string' || !JWT_ID_PATTERN.test(payload.jti) || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if ((payload.exp as number) <= (payload.iat as number) || (payload.exp as number) - (payload.iat as number) > APP_SESSION_LIFETIME_SECONDS || (payload.iat as number) > now + 60) return null;
    return { id: payload.sub, username: payload.username };
  } catch { return null; }
}

function cookieName(isProduction: boolean) { return isProduction ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE; }
function cookieAttributes(isProduction: boolean) { return ['Path=/', 'HttpOnly', ...(isProduction ? ['Secure'] : []), 'SameSite=Lax']; }

export function serializeSessionCookie(token: string, isProduction: boolean): string {
  if (!JWT_PATTERN.test(token)) throw new Error('Invalid session token');
  return `${cookieName(isProduction)}=${token}; ${cookieAttributes(isProduction).join('; ')}`;
}

export function serializeLogoutCookie(isProduction: boolean): string {
  return `${cookieName(isProduction)}=; ${cookieAttributes(isProduction).join('; ')}; Max-Age=0`;
}

export function extractSessionToken(cookieHeader: string | undefined, isProduction: boolean): string | null {
  if (!cookieHeader) return null;
  const expected = cookieName(isProduction) + '=';

  let match: string | null = null;
  let start = 0;

  while (start < cookieHeader.length) {
    while (start < cookieHeader.length && cookieHeader.charCodeAt(start) === 32) {
      start++;
    }

    let end = cookieHeader.indexOf(';', start);
    if (end === -1) end = cookieHeader.length;

    if (cookieHeader.startsWith(expected, start)) {
      if (match !== null) return null;

      let valEnd = end;
      while (valEnd > start && cookieHeader.charCodeAt(valEnd - 1) === 32) {
        valEnd--;
      }

      match = cookieHeader.slice(start + expected.length, valEnd);
    }

    start = end + 1;
  }

  return match !== null && JWT_PATTERN.test(match) ? match : null;
}

export function isExpectedBrowserOrigin(origin: string | undefined, expectedOrigin: string): boolean { return origin === expectedOrigin; }
export function createSanitizedAuthResponse(user: InternalUser) { return { verified: true, user: { id: user.id, username: user.username } }; }

