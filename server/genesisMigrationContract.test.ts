import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/202609010011_genesis_cap_growth_v1.sql', import.meta.url)), 'utf8');

describe('Genesis CAP additive migration contract', () => {
  it('keeps monthly participation unique per epoch and human', () => assert.match(sql, /unique \(epoch_id, user_id\)/));
  it('requires the monthly UTC YYYY-MM model and zero fixed claim units', () => { assert.match(sql, /MONTHLY_EQUAL_POOL_V2/); assert.match(sql, /claim_units = 0/); assert.match(sql, /calendar_period ~ '\^20/); });
  it('settles only from the CLOSED state and persists unissued remainder', () => { assert.match(sql, /status<>'CLOSED'/); assert.match(sql, /unissued_remainder_units=v_remainder/); });
  it('keeps source-attributed CAP distributions immutable', () => { assert.match(sql, /TITLE_ENTITLEMENT','HUMAN_CLAIM','GENESIS_GROWTH','OTHER_FUTURE/); assert.match(sql, /cap_distributions_immutable/); });
  it('counts only verified settled purchases for Title milestones', () => { assert.match(sql, /p\.status='settled'/); assert.match(sql, /p\.settlement_mode='verified'/); });
  it('retires service-role mutation access to daily claim and paid scratch V1', () => { assert.match(sql, /revoke execute on function public\.worldcap_claim_human_cap/); assert.match(sql, /revoke execute on function public\.worldprize_reveal_scratch/); });
  it('contains no seeded Genesis campaign or reward amount', () => { assert.doesNotMatch(sql, /insert into public\.cap_growth_campaigns/i); assert.doesNotMatch(sql, /insert into public\.cap_growth_quests/i); });
});
