import { Router, type Request } from 'express';
import { extractSessionToken, verifyApplicationSession, type AppSessionConfig, type InternalUser } from './appSession.js';
import type { GenesisCapRepository } from './genesisCapTypes.js';
import { createFixedWindowRateLimiter } from './rateLimit.js';
import { operationalLog } from './structuredLogger.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERRAL_PATTERN = /^[A-F0-9]{16}$/;

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]));
  return value;
}

function userFor(request: Request, config: AppSessionConfig): InternalUser {
  const token = extractSessionToken(request.headers.cookie, config.isProduction);
  const user = token ? verifyApplicationSession(token, config.sessionSecret) : null;
  if (!user) throw new Error('authentication_required');
  return user;
}

function statusFor(error: string): number {
  if (error === 'authentication_required') return 401;
  if (error.includes('not_found')) return 404;
  if (error.includes('not_open') || error.includes('not_active') || error.includes('not_qualified') || error.includes('unavailable') || error.includes('budget')) return 409;
  return 400;
}

export function createGenesisCapRouter(repository: GenesisCapRepository, sessionConfig: AppSessionConfig): Router {
  const router = Router();
  router.use((request, response, next) => {
    try { response.locals.user = userFor(request, sessionConfig); return next(); }
    catch { return response.status(401).json({ error: 'authentication_required' }); }
  });

  router.get('/journey', async (_request, response) => {
    try { return response.json(jsonSafe(await repository.getJourney(response.locals.user as InternalUser, new Date()))); }
    catch (error) { const reason = error instanceof Error ? error.message : 'journey_unavailable'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.get('/human-claim/active', async (_request, response) => {
    try { const journey = await repository.getJourney(response.locals.user as InternalUser, new Date()); return response.json(jsonSafe(journey.humanClaim)); }
    catch (error) { const reason = error instanceof Error ? error.message : 'human_claim_unavailable'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.post('/human-claim/register', createFixedWindowRateLimiter(4, 60_000), async (_request, response) => {
    try {
      const result = await repository.registerMonthlyClaim(response.locals.user as InternalUser, new Date());
      operationalLog('human_claim_registration', { replayed: result.replayed, epochId: result.participation.epochId });
      return response.json(jsonSafe(result));
    } catch (error) { const reason = error instanceof Error ? error.message : 'human_claim_registration_failed'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.post('/genesis/quests/:questId/evaluate', createFixedWindowRateLimiter(20, 60_000), async (request, response) => {
    const questId = String(request.params.questId ?? ''); if (!UUID_PATTERN.test(questId)) return response.status(400).json({ error: 'quest_id_invalid' });
    try { return response.json(jsonSafe(await repository.evaluateQuest(response.locals.user as InternalUser, questId, new Date()))); }
    catch (error) { const reason = error instanceof Error ? error.message : 'growth_quest_evaluation_failed'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.post('/genesis/quests/:questId/claim', createFixedWindowRateLimiter(10, 60_000), async (request, response) => {
    const questId = String(request.params.questId ?? ''); if (!UUID_PATTERN.test(questId)) return response.status(400).json({ error: 'quest_id_invalid' });
    try { return response.json(jsonSafe(await repository.claimQuestReward(response.locals.user as InternalUser, questId, new Date()))); }
    catch (error) { const reason = error instanceof Error ? error.message : 'growth_quest_claim_failed'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.post('/genesis/referrals', createFixedWindowRateLimiter(5, 60_000), async (request, response) => {
    const code = typeof request.body?.inviterCode === 'string' ? request.body.inviterCode.trim().toUpperCase() : '';
    if (!REFERRAL_PATTERN.test(code)) return response.status(400).json({ error: 'referral_code_invalid' });
    try { return response.json(await repository.registerReferral(response.locals.user as InternalUser, code, new Date())); }
    catch (error) { const reason = error instanceof Error ? error.message : 'referral_registration_failed'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  router.post('/genesis/social-posts', createFixedWindowRateLimiter(10, 60_000), async (request, response) => {
    const body = typeof request.body?.body === 'string' ? request.body.body : '';
    try { return response.json(await repository.createSocialPost(response.locals.user as InternalUser, body, new Date())); }
    catch (error) { const reason = error instanceof Error ? error.message : 'social_post_failed'; return response.status(statusFor(reason)).json({ error: reason }); }
  });
  return router;
}

export function createFounderControlRouter(repository: GenesisCapRepository, sessionConfig: AppSessionConfig, founderUserIds: ReadonlySet<string>): Router {
  const router = Router();
  router.get('/control-center', async (request, response) => {
    let user: InternalUser;
    try { user = userFor(request, sessionConfig); } catch { return response.status(401).json({ error: 'authentication_required' }); }
    if (!founderUserIds.has(user.id)) { operationalLog('founder_access_denied', { userIdHashSuffix: user.id.slice(-8) }); return response.status(403).json({ error: 'founder_access_denied' }); }
    try { return response.json(jsonSafe(await repository.getFounderMetrics(new Date()))); }
    catch { return response.status(503).json({ error: 'founder_metrics_unavailable' }); }
  });
  return router;
}

export function createPublicCapFairnessRouter(repository: GenesisCapRepository): Router {
  const router = Router();
  router.get('/summary', async (_request, response) => {
    response.setHeader('Cache-Control', 'public, max-age=30');
    try { return response.json(jsonSafe(await repository.getPublicSummary(new Date()))); }
    catch { return response.status(503).json({ error: 'cap_fairness_unavailable' }); }
  });
  return router;
}

export function parseFounderUserIds(environment: NodeJS.ProcessEnv): ReadonlySet<string> {
  const raw = environment.FOUNDER_USER_IDS?.trim(); if (!raw) return new Set();
  const ids = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (ids.some((id) => !/^user_[0-9a-f]{64}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error('founder_user_ids_invalid');
  return new Set(ids);
}
