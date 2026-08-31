import express from 'express';
import type { AppSessionConfig, InternalUser } from './appSession.js';
import { extractSessionToken, verifyApplicationSession } from './appSession.js';
import type { EconomyService } from './economyService.js';
import { createFixedWindowRateLimiter } from './rateLimit.js';
import { operationalLog } from './structuredLogger.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

function safeJson(value: unknown): unknown { return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)); }

function errorStatus(message: string): number {
  if (message.includes('not_found')) return 404;
  if (message.includes('consumed') || message.includes('completed') || message.includes('expired')) return 409;
  if (message.startsWith('payment_') || message.startsWith('invalid_') || message.includes('unsupported')) return 422;
  return 503;
}

export function createEconomyRouter(service: EconomyService, sessionConfig: AppSessionConfig) {
  const router = express.Router();
  router.use(express.json({ limit: '16kb', strict: true }));
  router.use((request, response, next) => {
    const token = extractSessionToken(request.headers.cookie, sessionConfig.isProduction);
    const user = token ? verifyApplicationSession(token, sessionConfig.sessionSecret) : null;
    if (!user) return response.status(401).json({ error: 'Authentication required' });
    (request as express.Request & { authenticatedUser?: InternalUser }).authenticatedUser = user;
    return next();
  });
  const userFor = (request: express.Request) => (request as express.Request & { authenticatedUser: InternalUser }).authenticatedUser;

  router.get('/snapshot', async (request, response) => {
    try { return response.json(safeJson(await service.snapshot(userFor(request)))); }
    catch { return response.status(503).json({ error: 'Economic state unavailable' }); }
  });

  router.post('/purchase-intents', createFixedWindowRateLimiter(20, 60_000), async (request, response) => {
    const campaignId = request.body?.campaignId;
    const tierId = request.body?.tierId;
    const quantity = request.body?.quantity;
    if (typeof campaignId !== 'string' || !UUID_PATTERN.test(campaignId) || (tierId !== undefined && (typeof tierId !== 'string' || !UUID_PATTERN.test(tierId))) || !Number.isSafeInteger(quantity)) return response.status(400).json({ error: 'Invalid purchase request' });
    try { return response.status(201).json(safeJson(await service.createPurchaseIntent(userFor(request), { campaignId, tierId, quantity }))); }
    catch (error) { return response.status(errorStatus(error instanceof Error ? error.message : '')).json({ error: 'Purchase intent rejected' }); }
  });

  router.post('/purchase-intents/:reference/confirm', createFixedWindowRateLimiter(20, 60_000), async (request, response) => {
    const reference = Array.isArray(request.params.reference) ? request.params.reference[0] : request.params.reference;
    const transactionId = request.body?.transactionId;
    if (!reference || !UUID_PATTERN.test(reference) || typeof transactionId !== 'string' || !TRANSACTION_ID_PATTERN.test(transactionId)) return response.status(400).json({ error: 'Invalid payment confirmation' });
    try { const result = await service.confirmPurchase(userFor(request), reference, transactionId); operationalLog('payment_confirmation', { reference, purchaseId: result.purchase.id, status: result.replayed ? 'replayed' : 'completed' }); return response.json(safeJson(result)); }
    catch (error) { const reason = error instanceof Error ? error.message : 'payment_confirmation_rejected'; operationalLog('payment_confirmation', { reference, status: 'rejected', reason }); return response.status(errorStatus(reason)).json({ error: reason }); }
  });

  router.post('/titles/:titleId/scratch', createFixedWindowRateLimiter(15, 60_000), async (request, response) => {
    const titleId = Array.isArray(request.params.titleId) ? request.params.titleId[0] : request.params.titleId;
    if (!titleId || !UUID_PATTERN.test(titleId)) return response.status(400).json({ error: 'Invalid title' });
    try { return response.json(safeJson(await service.revealScratch(userFor(request), titleId))); }
    catch (error) { return response.status(errorStatus(error instanceof Error ? error.message : '')).json({ error: error instanceof Error ? error.message : 'Scratch rejected' }); }
  });
  return router;
}
