import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorldIdConfig, EXPECTED_WORLD_ID_ACTION } from './config.js';

describe('World ID server configuration', () => {
  const valid = { WORLD_RP_ID: 'rp_worldprize', WORLD_RP_SIGNING_KEY: 'ab'.repeat(32), WORLD_ID_ACTION: EXPECTED_WORLD_ID_ACTION } as NodeJS.ProcessEnv;
  it('accepts only the exact action and well-formed RP configuration', () => { assert.deepEqual(createWorldIdConfig(valid), { rpId: 'rp_worldprize', signingKey: 'ab'.repeat(32), action: EXPECTED_WORLD_ID_ACTION }); });
  it('fails closed when the action is missing or changed', () => {
    assert.equal(createWorldIdConfig({ ...valid, WORLD_ID_ACTION: undefined }), null);
    assert.equal(createWorldIdConfig({ ...valid, WORLD_ID_ACTION: 'other-action' }), null);
  });
});
