import { signRequest, type RpSignature } from '@worldcoin/idkit-core/signing';
import { isValidWorldRpId } from './config.js';

const SESSION_ID_PATTERN = /^session_[0-9a-fA-F]{128}$/;
type SessionSigner = (params: { signingKeyHex: string }) => RpSignature;

export interface SessionRpContext {
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  rp_id: string;
}

export interface VerifiedWorldSession {
  sessionId: string;
  verification: 'proof_of_human';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function isValidProofPayload(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function createSessionRpContext(signingKeyHex: string, rpId: string, signer: SessionSigner = signRequest): SessionRpContext {
  if (!signingKeyHex || !isValidWorldRpId(rpId)) throw new Error('Invalid World ID server configuration');
  // IDKit 4.x session proofs are intentionally actionless. Action-scoped proofs
  // use a different signed message and must never be substituted here.
  const { sig, nonce, createdAt, expiresAt } = signer({ signingKeyHex });
  return { sig, nonce, created_at: createdAt, expires_at: expiresAt, rp_id: rpId };
}

export function getVerifiedWorldSession(value: unknown): VerifiedWorldSession | null {
  if (!isRecord(value) || value.success !== true || value.environment !== 'production' || !Array.isArray(value.results)) return null;
  if (typeof value.session_id !== 'string' || !SESSION_ID_PATTERN.test(value.session_id)) return null;
  const hasProofOfHuman = value.results.some((result) => isRecord(result) && result.identifier === 'proof_of_human' && result.success === true);
  return hasProofOfHuman ? { sessionId: value.session_id, verification: 'proof_of_human' } : null;
}

