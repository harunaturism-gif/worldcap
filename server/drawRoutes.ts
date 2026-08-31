import express from 'express';
import type { DrawService } from './drawService.js';
import { createFixedWindowRateLimiter } from './rateLimit.js';
import { operationalLog } from './structuredLogger.js';

const DRAW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

export function createDrawFairnessRouter(service: DrawService) {
  const router = express.Router();
  router.use(createFixedWindowRateLimiter(60, 60_000));
  router.get('/:drawId/fairness', async (request, response) => {
    const drawId = Array.isArray(request.params.drawId) ? request.params.drawId[0] : request.params.drawId;
    if (!drawId || !DRAW_ID_PATTERN.test(drawId)) return response.status(400).json({ error: 'Invalid draw' });
    const result = await service.getFairness(drawId);
    return result ? response.json(result) : response.status(404).json({ error: 'Draw not found' });
  });
  router.get('/:drawId/manifest', async (request, response) => {
    const drawId = Array.isArray(request.params.drawId) ? request.params.drawId[0] : request.params.drawId;
    if (!drawId || !DRAW_ID_PATTERN.test(drawId)) return response.status(400).json({ error: 'Invalid draw' });
    const manifest = await service.getManifest(drawId);
    return manifest ? response.json(manifest) : response.status(404).json({ error: 'Draw manifest not found' });
  });
  router.get('/:drawId/artifact', async (request, response) => {
    const drawId = Array.isArray(request.params.drawId) ? request.params.drawId[0] : request.params.drawId;
    if (!drawId || !DRAW_ID_PATTERN.test(drawId)) return response.status(400).json({ error: 'Invalid draw' });
    const artifact = await service.getPublicArtifact(drawId);
    if (!artifact) return response.status(404).json({ error: 'Public draw artifact not found' });
    response.setHeader('ETag', `"${artifact.artifactContentHash.slice(7)}"`);
    response.setHeader('Cache-Control', 'public, max-age=60, immutable');
    return response.json(artifact);
  });
  router.get('/:drawId/verify', async (request, response) => {
    const drawId = Array.isArray(request.params.drawId) ? request.params.drawId[0] : request.params.drawId;
    if (!drawId || !DRAW_ID_PATTERN.test(drawId)) return response.status(400).json({ error: 'Invalid draw' });
    const verification = await service.verifyPublicDraw(drawId);
    if (!verification) return response.status(404).json({ error: 'Public verification data not found' });
    if (!verification.verified) operationalLog('verification_failure', { drawId, reason: verification.errors.join(',') });
    return response.json(verification);
  });
  return router;
}
