const baseUrl = (process.env.BETA_BASE_URL ?? process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(baseUrl)) throw new Error('BETA_BASE_URL must be one exact HTTPS origin');

async function request(path, expectedStatuses, contentType, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Origin: baseUrl, ...init.headers },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!expectedStatuses.includes(response.status)) throw new Error(`${path}: expected ${expectedStatuses.join('/')} but received ${response.status}`);
  if (contentType && !response.headers.get('content-type')?.includes(contentType)) throw new Error(`${path}: unexpected content type`);
  return response;
}

const health = await (await request('/health', [200], 'application/json')).json();
if (health.status !== 'alive' || health.runtime !== 'beta') throw new Error('/health: unsafe runtime response');
const ready = await (await request('/ready', [200], 'application/json')).json();
if (ready.ready !== true || ready.missingConfiguration?.length) throw new Error('/ready: deployment is not ready');
const runtime = await (await request('/api/health', [200], 'application/json')).json();
if (runtime.runtime !== 'beta' || runtime.paymentMode !== 'beta-demo') throw new Error('/api/health: unsafe beta capability set');
const rpContext = await (await request('/api/auth/session-rp-context', [200], 'application/json', { method: 'POST' })).json();
if (typeof rpContext.rp_id !== 'string' && typeof rpContext.rpId !== 'string') throw new Error('/api/auth/session-rp-context: World ID route unavailable');
await request('/api/auth/dev-session', [404], 'application/json', { method: 'POST' });
await request('/api/auth/session', [401], 'application/json');
await request('/api/economy/snapshot', [401], 'application/json');
await request('/api/draws/smoke-check/fairness', [404], 'application/json');
await request('/api/draws/smoke-check/artifact', [404], 'application/json');
await request('/api/draws/smoke-check/verify', [404], 'application/json');
await request('/', [200], 'text/html');
console.log(JSON.stringify({ baseUrl, health: 'pass', readiness: 'pass', routes: 'pass', frontend: 'pass' }));
