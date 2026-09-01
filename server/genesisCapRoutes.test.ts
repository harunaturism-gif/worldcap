import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, describe, it } from 'node:test';
import express from 'express';
import { serializeSessionCookie, signApplicationSession, type AppSessionConfig, type InternalUser } from './appSession.js';
import { DevelopmentMemoryGenesisCapRepository } from './genesisCapGrowth.js';
import { createFounderControlRouter, createGenesisCapRouter, createPublicCapFairnessRouter, parseFounderUserIds } from './genesisCapRoutes.js';

const user: InternalUser = { id: `user_${'d'.repeat(64)}`, username: 'Human_DDDDDDDD' };
const config: AppSessionConfig = { appOrigin: 'http://127.0.0.1:5173', identitySecret: 'identity-secret-with-enough-entropy-1234', isProduction: false, sessionSecret: 'session-secret-with-enough-entropy-56789' };

async function start(founders: ReadonlySet<string>) {
  const repository = new DevelopmentMemoryGenesisCapRepository();
  const app = express(); app.use(express.json()); app.use('/api/cap/fairness', createPublicCapFairnessRouter(repository)); app.use('/api/cap', createGenesisCapRouter(repository, config)); app.use('/api/founder', createFounderControlRouter(repository, config, founders));
  const server = await new Promise<Server>((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); }); after(() => server.close());
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, cookie: serializeSessionCookie(signApplicationSession(user, config.sessionSecret), false) };
}

describe('Genesis CAP route boundaries', () => {
  it('requires an application session for journey and mutations', async () => {
    const target = await start(new Set());
    assert.equal((await fetch(`${target.base}/api/cap/journey`)).status, 401);
    assert.equal((await fetch(`${target.base}/api/cap/human-claim/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  });

  it('keeps public CAP fairness aggregate-only and unauthenticated', async () => {
    const target = await start(new Set()); const response = await fetch(`${target.base}/api/cap/fairness/summary`); const body = await response.text();
    assert.equal(response.status, 200); assert.equal(body.includes(user.id), false); assert.equal(body.includes('walletAddress'), false);
  });

  it('denies founder metrics unless the verified internal user is allowlisted', async () => {
    const target = await start(new Set()); const response = await fetch(`${target.base}/api/founder/control-center`, { headers: { cookie: target.cookie } });
    assert.equal(response.status, 403);
  });

  it('keeps the allowlisted founder surface read-only', async () => {
    const target = await start(new Set([user.id]));
    assert.equal((await fetch(`${target.base}/api/founder/control-center`, { headers: { cookie: target.cookie } })).status, 200);
    assert.equal((await fetch(`${target.base}/api/founder/control-center`, { method: 'POST', headers: { cookie: target.cookie } })).status, 404);
  });

  it('fails closed for malformed or duplicate founder allowlist entries', () => {
    assert.throws(() => parseFounderUserIds({ FOUNDER_USER_IDS: 'not-a-user' }), /invalid/);
    assert.throws(() => parseFounderUserIds({ FOUNDER_USER_IDS: `${user.id},${user.id}` }), /invalid/);
  });
});
