-- Explicit non-monetary beta purchase mode. Impossible to invoke from browser
-- roles and never counted as verified WLD spend.

alter table public.purchases add column if not exists settlement_mode text not null default 'verified'
  check (settlement_mode in ('verified','demo'));
alter table public.treasury_allocations add column if not exists settlement_mode text not null default 'accounting'
  check (settlement_mode in ('accounting','demo_modeled'));

alter table public.ledger_entries drop constraint if exists ledger_entries_classification_check;
alter table public.ledger_entries add constraint ledger_entries_classification_check
  check (classification in ('verified_purchase','demo_purchase','simulated_scratch_prize'));

create or replace function public.worldcap_complete_demo_purchase(
  p_user_id text, p_reference uuid, p_transaction_id text,
  p_transaction_hash text, p_payer_address text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_result jsonb; v_purchase_id uuid; v_total numeric(78,0); v_mode text;
begin
  if p_transaction_id !~ '^demotx_[0-9a-f-]{36}$' then raise exception 'invalid_beta_demo_transaction'; end if;
  v_result := public.worldprize_complete_purchase(p_user_id, p_reference, p_transaction_id, p_transaction_hash, p_payer_address);
  v_purchase_id := (v_result->'purchase'->>'id')::uuid;
  select total_units, settlement_mode into strict v_total, v_mode from public.purchases where id = v_purchase_id for update;
  if v_mode = 'verified' then
    update public.purchases set settlement_mode = 'demo' where id = v_purchase_id;
    update public.wallets set verified_spend_units = greatest(0, verified_spend_units - v_total), updated_at = now() where user_id = p_user_id;
    update public.ledger_entries set classification = 'demo_purchase', spendable = false,
      description = replace(description, 'verified', 'non-monetary beta demo')
      where reference_id = v_purchase_id::text and classification = 'verified_purchase';
    update public.treasury_allocations set settlement_mode = 'demo_modeled' where purchase_id = v_purchase_id;
  elsif v_mode <> 'demo' then
    raise exception 'demo_purchase_mode_invalid';
  end if;
  return jsonb_set(v_result, '{purchase,settlement_mode}', '"demo"'::jsonb, true);
end;
$$;

revoke all on function public.worldcap_complete_demo_purchase(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.worldcap_complete_demo_purchase(text, uuid, text, text, text) to service_role;

comment on function public.worldcap_complete_demo_purchase(text, uuid, text, text, text) is
  'Explicit beta-only non-monetary issuance wrapper. Deployment runtime policy must forbid it in production.';
