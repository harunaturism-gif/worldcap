import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createSessionRpContext, getVerifiedWorldSession, isValidProofPayload } from './authSession.js';
import {
  createAppSessionConfig, createSanitizedAuthResponse, deriveInternalUser, extractSessionToken,
  isExpectedBrowserOrigin, serializeLogoutCookie, serializeSessionCookie, signApplicationSession,
  verifyApplicationSession, type InternalUser,
} from './appSession.js';
import { createPersistenceConfig, createWorldIdConfig, isDevelopmentAuthEnabled } from './config.js';
import { DevelopmentMemoryEconomyRepository, type EconomyRepository } from './economyRepository.js';
import { createEconomyRouter } from './economyRoutes.js';
import { EconomyService } from './economyService.js';
import { createIdentityRepository, type IdentityRepository } from './identityRepository.js';
import {
  createPaymentConfig, DevelopmentPaymentVerifier, DisabledPaymentVerifier,
  WorldDeveloperPaymentVerifier, BetaDemoPaymentVerifier, type PaymentVerifier,
} from './paymentVerifier.js';
import { LocalRandomnessProvider } from './randomness.js';
import { createFixedWindowRateLimiter } from './rateLimit.js';
import { createSupabaseEconomyRepository } from './supabaseEconomyRepository.js';
import { createDrawRandomnessProvider } from './drawRandomness.js';
import { DevelopmentMemoryDrawRepository, type DrawRepository } from './drawRepository.js';
import { createDrawFairnessRouter } from './drawRoutes.js';
import { DrawService } from './drawService.js';
import { createSupabaseReadOnlyDrawRepository } from './supabaseDrawRepository.js';
import { createRuntimePolicy, validateProviderReadiness } from './runtimePolicy.js';
import { createOperationalRouter } from './operationalHealth.js';
import { operationalLog } from './structuredLogger.js';
import { createCommitmentAnchorConfig, ViemCommitmentAnchorReader } from './commitmentAnchor.js';
import { createSupabaseReconciliationStore, PaymentReconciliationWorker } from './paymentReconciliation.js';
import { createSupabaseManifestPublication } from './supabaseManifestPublisher.js';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
const modeEnv = fileURLToPath(new URL(`../.env.${process.env.NODE_ENV ?? 'development'}`, import.meta.url));
dotenv.config({ path: modeEnv });
dotenv.config({ path: rootEnv });

const app = express();
const port = Number(process.env.PORT ?? 3001);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid server port');

const worldIdConfig = createWorldIdConfig(process.env);
const appSessionConfig = createAppSessionConfig(process.env);
const persistenceConfig = createPersistenceConfig(process.env);
const paymentConfig = createPaymentConfig(process.env);
const runtimePolicy = createRuntimePolicy(process.env);
const commitmentAnchorConfig = createCommitmentAnchorConfig(process.env);
const devAuthEnabled = isDevelopmentAuthEnabled(process.env);
const isProductionProcess = process.env.NODE_ENV !== 'development';

if (isProductionProcess && (!worldIdConfig || !appSessionConfig || !persistenceConfig || persistenceConfig.mode !== 'supabase' || !paymentConfig)) {
  throw new Error('Invalid production/testnet authentication, payment, or persistence configuration');
}
if (!isProductionProcess && (!appSessionConfig || !persistenceConfig || !paymentConfig || !devAuthEnabled)) {
  throw new Error('Invalid explicit development configuration');
}

const identityRepository: IdentityRepository | null = persistenceConfig ? createIdentityRepository(persistenceConfig) : null;
let economyRepository: EconomyRepository | null = null;
if (persistenceConfig?.mode === 'development-memory') economyRepository = new DevelopmentMemoryEconomyRepository();
if (persistenceConfig?.mode === 'supabase') economyRepository = createSupabaseEconomyRepository(persistenceConfig);

let paymentVerifier: PaymentVerifier | null = null;
if (paymentConfig?.runtime === 'development') paymentVerifier = new DevelopmentPaymentVerifier(paymentConfig);
if (paymentConfig?.runtime === 'testnet') paymentVerifier = new DisabledPaymentVerifier();
if (paymentConfig?.runtime === 'beta' && paymentConfig.betaDemoEnabled) paymentVerifier = new BetaDemoPaymentVerifier(paymentConfig);
if (paymentConfig?.runtime === 'beta' && !paymentConfig.betaDemoEnabled) paymentVerifier = new WorldDeveloperPaymentVerifier({ ...paymentConfig, runtime: 'production' });
if (paymentConfig?.runtime === 'production') paymentVerifier = new WorldDeveloperPaymentVerifier(paymentConfig);

const economyService = economyRepository && paymentVerifier && paymentConfig
  ? new EconomyService(economyRepository, paymentVerifier, new LocalRandomnessProvider(), paymentConfig)
  : null;
const workerId = `worldcap-${process.pid}`;
const reconciliationStore = persistenceConfig?.mode === 'supabase' ? createSupabaseReconciliationStore(persistenceConfig, workerId) : null;
let drawRepository: DrawRepository | null = null;
if (!isProductionProcess) drawRepository = new DevelopmentMemoryDrawRepository();
if (isProductionProcess && persistenceConfig?.mode === 'supabase') drawRepository = createSupabaseReadOnlyDrawRepository(persistenceConfig);
const drawService = drawRepository ? new DrawService(
  drawRepository,
  createDrawRandomnessProvider(process.env),
  commitmentAnchorConfig ? { reader: new ViemCommitmentAnchorReader(commitmentAnchorConfig), required: runtimePolicy.runtime !== 'development' } : undefined,
) : null;

async function probePersistence(): Promise<boolean> {
  if (persistenceConfig?.mode === 'development-memory') return true;
  if (persistenceConfig?.mode !== 'supabase' || !persistenceConfig.supabaseUrl || !persistenceConfig.serviceRoleKey) return false;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${persistenceConfig.supabaseUrl}/rest/v1/`, { headers: { apikey: persistenceConfig.serviceRoleKey }, signal: controller.signal });
    await response.body?.cancel(); return response.ok;
  } catch { return false; } finally { clearTimeout(timeout); }
}

app.disable('x-powered-by');
app.use(createOperationalRouter({
  runtime: runtimePolicy.runtime,
  configurationValid: Boolean(worldIdConfig && appSessionConfig && persistenceConfig && paymentConfig),
  persistenceConfigured: Boolean(persistenceConfig),
  providerConfigurationMissing: validateProviderReadiness(runtimePolicy, process.env),
  probePersistence,
}));
app.get('/api/health', (_request, response) => response.json({
  ok: true,
  runtime: paymentConfig?.runtime ?? 'unconfigured',
  authConfigured: Boolean((worldIdConfig || devAuthEnabled) && appSessionConfig && identityRepository),
  persistence: persistenceConfig?.mode ?? 'unconfigured',
  paymentMode: economyService?.paymentMode() ?? 'disabled',
  scratchSettlement: 'simulated',
}));

app.use(['/api/auth', '/api/economy'], (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Origin');
  if (!appSessionConfig || !isExpectedBrowserOrigin(request.headers.origin, appSessionConfig.appOrigin)) {
    return response.status(appSessionConfig ? 403 : 503).json({ error: appSessionConfig ? 'Origin not allowed' : 'Server authentication is not configured' });
  }
  response.setHeader('Access-Control-Allow-Origin', appSessionConfig.appOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return response.status(204).end();
  }
  return next();
});

app.use('/api/auth/session-rp-context', createFixedWindowRateLimiter(10, 60_000));
app.use('/api/auth/verify', createFixedWindowRateLimiter(5, 60_000));
app.use('/api/auth/dev-session', createFixedWindowRateLimiter(10, 60_000));
app.use('/api/auth', express.json({ limit: '16kb', strict: true }));

app.post('/api/auth/dev-session', async (_request, response) => {
  if (!devAuthEnabled || persistenceConfig?.mode !== 'development-memory' || !appSessionConfig || !identityRepository) return response.status(404).json({ error: 'Not found' });
  const user: InternalUser = { id: `user_${'0'.repeat(56)}deadbeef`, username: 'Human_DEADBEEF' };
  await identityRepository.upsertVerifiedIdentity(user, `session_${'0'.repeat(128)}`, 'rp_development');
  const applicationToken = signApplicationSession(user, appSessionConfig.sessionSecret);
  response.setHeader('Set-Cookie', serializeSessionCookie(applicationToken, false));
  return response.json(createSanitizedAuthResponse(user));
});

app.post('/api/auth/session-rp-context', (_request, response) => {
  if (!worldIdConfig) return response.status(503).json({ error: 'World ID is not configured' });
  try { return response.json(createSessionRpContext(worldIdConfig.signingKey, worldIdConfig.rpId)); }
  catch { return response.status(500).json({ error: 'Failed to create session RP context' }); }
});

app.post('/api/auth/verify', async (request, response) => {
  if (!worldIdConfig || !appSessionConfig || !identityRepository) return response.status(503).json({ error: 'Authentication service unavailable' });
  const proof = request.body?.proof;
  if (!isValidProofPayload(proof)) return response.status(400).json({ error: 'Invalid proof payload' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const worldResponse = await fetch(`https://developer.world.org/api/v4/verify/${worldIdConfig.rpId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(proof), signal: controller.signal,
    });
    if (!worldResponse.ok) { await worldResponse.body?.cancel(); operationalLog('auth_failure', { reason: 'world_id_proof_rejected' }); return response.status(401).json({ error: 'World ID proof rejected' }); }
    const verified = getVerifiedWorldSession(await worldResponse.json());
    if (!verified) return response.status(401).json({ error: 'Proof did not satisfy proof_of_human session requirements' });
    const user = deriveInternalUser(verified.sessionId, appSessionConfig.identitySecret);
    await identityRepository.upsertVerifiedIdentity(user, verified.sessionId, worldIdConfig.rpId);
    const token = signApplicationSession(user, appSessionConfig.sessionSecret);
    response.setHeader('Set-Cookie', serializeSessionCookie(token, appSessionConfig.isProduction));
    return response.json(createSanitizedAuthResponse(user));
  } catch {
    operationalLog('auth_failure', { reason: controller.signal.aborted ? 'world_id_timeout' : 'world_id_unavailable' });
    return response.status(controller.signal.aborted ? 504 : 502).json({ error: controller.signal.aborted ? 'World ID verification timed out' : 'World ID verification unavailable' });
  } finally { clearTimeout(timeout); }
});

app.get('/api/auth/session', (request, response) => {
  if (!appSessionConfig) return response.status(503).json({ error: 'Authentication service unavailable' });
  const token = extractSessionToken(request.headers.cookie, appSessionConfig.isProduction);
  const user = token ? verifyApplicationSession(token, appSessionConfig.sessionSecret) : null;
  return user ? response.json({ authenticated: true, user }) : response.status(401).json({ error: 'Authentication required' });
});

app.post('/api/auth/logout', (_request, response) => {
  if (!appSessionConfig) return response.status(503).json({ error: 'Authentication service unavailable' });
  response.setHeader('Set-Cookie', serializeLogoutCookie(appSessionConfig.isProduction));
  return response.json({ success: true });
});

if (economyService && appSessionConfig) app.use('/api/economy', createEconomyRouter(economyService, appSessionConfig, reconciliationStore ?? undefined));
if (drawService) app.use('/api/draws', createDrawFairnessRouter(drawService));

if (process.env.ENABLE_BACKGROUND_WORKERS === 'true') {
  if (runtimePolicy.runtime === 'development' || !reconciliationStore || !economyRepository || !paymentVerifier || !persistenceConfig || persistenceConfig.mode !== 'supabase') throw new Error('background_workers_not_configured');
  const reconciliationWorker = new PaymentReconciliationWorker(reconciliationStore, economyRepository, paymentVerifier);
  const manifestBucket = process.env.PUBLIC_MANIFEST_BUCKET;
  if (!manifestBucket) throw new Error('public_manifest_bucket_required');
  const manifestWorker = createSupabaseManifestPublication(persistenceConfig, manifestBucket).worker;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await reconciliationWorker.runOnce(); await manifestWorker.runOnce(); }
    catch (error) { operationalLog('background_worker_failure', { reason: error instanceof Error ? error.message : 'background_worker_failed' }); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), 15_000).unref();
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next;
  if (error instanceof SyntaxError) return response.status(400).json({ error: 'Invalid JSON payload' });
  return response.status(500).json({ error: 'Unexpected server error' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`WorldCAP API listening on http://127.0.0.1:${port}`);
  console.log(`Runtime=${paymentConfig?.runtime ?? 'unconfigured'} payment=${economyService?.paymentMode() ?? 'disabled'} persistence=${persistenceConfig?.mode ?? 'unconfigured'}`);
});
