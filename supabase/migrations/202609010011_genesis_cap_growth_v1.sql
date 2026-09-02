-- WorldCAP Genesis CAP Growth + Monthly Human Claim V2.
-- CLOSED TECHNICAL BETA ONLY: all CAP accounting remains simulated/non-on-chain.
-- No supply, exchange rate, peg, liquidity, reward amount, or token transfer is defined here.

alter table public.cap_accounts add column if not exists spent_units numeric(78,0) not null default 0
  check (spent_units >= 0 and scale(spent_units) = 0);
alter table public.cap_accounts add column if not exists burned_units numeric(78,0) not null default 0
  check (burned_units >= 0 and scale(burned_units) = 0);

alter table public.cap_human_claim_epochs add column if not exists claim_model text not null default 'LEGACY_PERIODIC_V1';
alter table public.cap_human_claim_epochs add column if not exists calendar_period text;
alter table public.cap_human_claim_epochs add column if not exists pool_units numeric(78,0);
alter table public.cap_human_claim_epochs add column if not exists published_at timestamptz;
alter table public.cap_human_claim_epochs add column if not exists finalized_at timestamptz;
alter table public.cap_human_claim_epochs add column if not exists participant_count numeric(78,0) not null default 0;
alter table public.cap_human_claim_epochs add column if not exists settled_units_per_human numeric(78,0);
alter table public.cap_human_claim_epochs add column if not exists unissued_remainder_units numeric(78,0);

alter table public.cap_human_claim_epochs drop constraint if exists cap_human_claim_epochs_status_check;
alter table public.cap_human_claim_epochs drop constraint if exists cap_human_claim_epochs_claim_units_check;
alter table public.cap_human_claim_epochs drop constraint if exists cap_human_claim_epochs_period_seconds_check;
alter table public.cap_human_claim_epochs drop constraint if exists cap_human_claim_epochs_check;
alter table public.cap_human_claim_epochs add constraint cap_human_claim_epochs_status_v2_check check (
  (claim_model = 'LEGACY_PERIODIC_V1' and status in ('configured','active','closed'))
  or (claim_model = 'MONTHLY_EQUAL_POOL_V2' and status in ('DRAFT','PUBLISHED','OPEN','CLOSED','FINALIZED'))
);
alter table public.cap_human_claim_epochs add constraint cap_human_claim_epochs_claim_units_v2_check check (
  (claim_model = 'LEGACY_PERIODIC_V1' and claim_units > 0 and period_seconds >= 3600)
  or (claim_model = 'MONTHLY_EQUAL_POOL_V2' and claim_units = 0 and period_seconds = 0)
);
alter table public.cap_human_claim_epochs add constraint cap_human_claim_epochs_monthly_v2_check check (
  claim_model <> 'MONTHLY_EQUAL_POOL_V2'
  or (
    calendar_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    and pool_units > 0 and scale(pool_units) = 0
    and starts_at = (calendar_period || '-01T00:00:00Z')::timestamptz
    and ends_at = ((calendar_period || '-01T00:00:00Z')::timestamptz + interval '1 month')
    and budget_units = pool_units
    and participant_count >= 0 and scale(participant_count) = 0
    and (settled_units_per_human is null or (settled_units_per_human >= 0 and scale(settled_units_per_human) = 0))
    and (unissued_remainder_units is null or (unissued_remainder_units >= 0 and scale(unissued_remainder_units) = 0))
    and (
      (status = 'DRAFT' and published_at is null and closed_at is null and finalized_at is null)
      or (status in ('PUBLISHED','OPEN') and published_at is not null and closed_at is null and finalized_at is null)
      or (status = 'CLOSED' and published_at is not null and closed_at is not null and finalized_at is null)
      or (status = 'FINALIZED' and published_at is not null and closed_at is not null and finalized_at is not null and settled_units_per_human is not null and unissued_remainder_units is not null)
    )
  )
);
create unique index if not exists cap_monthly_claim_period_v2_idx on public.cap_human_claim_epochs(calendar_period) where claim_model = 'MONTHLY_EQUAL_POOL_V2';
drop index if exists public.cap_one_active_claim_epoch_per_metric_idx;
create unique index cap_one_active_claim_epoch_per_metric_idx on public.cap_human_claim_epochs(metric_id)
  where status in ('active','OPEN');

create table public.cap_monthly_claim_participations (
  id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null references public.cap_human_claim_epochs(id) on delete restrict,
  user_id text not null references public.users(id) on delete restrict,
  status text not null default 'REGISTERED' check (status in ('REGISTERED','SETTLED')),
  registered_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_units numeric(78,0) not null default 0 check (settled_units >= 0 and scale(settled_units) = 0),
  unique (epoch_id, user_id),
  check ((status = 'REGISTERED' and settled_at is null and settled_units = 0) or (status = 'SETTLED' and settled_at is not null))
);

create table public.cap_growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  version text not null check (version ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  name text not null check (char_length(name) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ACTIVE','CLOSED')),
  budget_units numeric(78,0) not null check (budget_units > 0 and scale(budget_units) = 0),
  published_at timestamptz,
  config_commitment text not null check (config_commitment ~ '^sha256:[0-9a-f]{64}$'),
  distributed_units numeric(78,0) not null default 0 check (distributed_units >= 0 and scale(distributed_units) = 0),
  reserved_units numeric(78,0) not null default 0 check (reserved_units >= 0 and scale(reserved_units) = 0),
  accounting_mode text not null default 'simulated' check (accounting_mode = 'simulated'),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at and distributed_units + reserved_units <= budget_units),
  check ((status = 'DRAFT' and published_at is null) or (status <> 'DRAFT' and published_at is not null))
);

create table public.cap_growth_quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.cap_growth_campaigns(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  kind text not null check (kind in ('FIRST_SOCIAL_POST','VERIFIED_PROFILE','VERIFIED_REFERRAL','TITLE_COUNT_MILESTONE','FIRST_COSMETIC_PURCHASE_REBATE','FOLLOW_INSTAGRAM','FOLLOW_X')),
  verification_mode text not null check (verification_mode in ('INTERNAL','EXTERNAL')),
  reward_units numeric(78,0) not null check (reward_units > 0 and scale(reward_units) = 0),
  max_rewarded_completions numeric(78,0) check (max_rewarded_completions > 0 and scale(max_rewarded_completions) = 0),
  milestone_threshold numeric(78,0) check (milestone_threshold > 0 and scale(milestone_threshold) = 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','ACTIVE','CLOSED')),
  created_at timestamptz not null default now(),
  unique (campaign_id, code),
  check ((verification_mode = 'EXTERNAL') = (kind in ('FOLLOW_INSTAGRAM','FOLLOW_X'))),
  check ((kind = 'TITLE_COUNT_MILESTONE' and milestone_threshold is not null) or (kind <> 'TITLE_COUNT_MILESTONE' and milestone_threshold is null))
);

create table public.cap_growth_progress (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.cap_growth_campaigns(id) on delete restrict,
  quest_id uuid not null references public.cap_growth_quests(id) on delete restrict,
  user_id text not null references public.users(id) on delete restrict,
  status text not null check (status in ('PENDING_VERIFICATION','QUALIFIED','CLAIMED')),
  verification_reference text,
  qualified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quest_id, user_id),
  check ((status = 'PENDING_VERIFICATION' and qualified_at is null and claimed_at is null) or (status = 'QUALIFIED' and qualified_at is not null and claimed_at is null) or (status = 'CLAIMED' and qualified_at is not null and claimed_at is not null))
);

create table public.cap_genesis_referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id text not null references public.users(id) on delete restrict,
  referee_user_id text not null unique references public.users(id) on delete restrict,
  inviter_code text not null check (inviter_code ~ '^[A-F0-9]{16}$'),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualification_reference text,
  check (inviter_user_id <> referee_user_id)
);

create table public.cap_cosmetic_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete restrict,
  purchase_reference text not null unique,
  verified_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.cap_distributions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('TITLE_ENTITLEMENT','HUMAN_CLAIM','GENESIS_GROWTH','OTHER_FUTURE')),
  campaign_id uuid,
  quest_id uuid references public.cap_growth_quests(id) on delete restrict,
  user_id text not null references public.users(id) on delete restrict,
  amount_units numeric(78,0) not null check (amount_units >= 0 and scale(amount_units) = 0),
  reason text not null check (char_length(reason) between 1 and 160),
  reference text not null unique,
  accounting_mode text not null default 'simulated' check (accounting_mode = 'simulated'),
  created_at timestamptz not null default now(),
  check ((source = 'GENESIS_GROWTH' and campaign_id is not null and quest_id is not null) or (source <> 'GENESIS_GROWTH' and quest_id is null))
);

create index cap_distribution_source_idx on public.cap_distributions(source, created_at);
create index cap_distribution_user_idx on public.cap_distributions(user_id, created_at);
create index cap_growth_progress_campaign_idx on public.cap_growth_progress(campaign_id, status);

create or replace function public.worldcap_guard_claim_epoch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_metric public.cap_campaign_metrics%rowtype; v_other_budget numeric(78,0);
begin
  if tg_op = 'DELETE' then
    if old.status not in ('configured','DRAFT') then raise exception 'cap_claim_epoch_immutable'; end if;
    return old;
  end if;
  select * into strict v_metric from public.cap_campaign_metrics where id=new.metric_id for update;
  if new.claim_model='MONTHLY_EQUAL_POOL_V2' then
    if new.budget_units<>new.pool_units or new.claim_units<>0 or new.period_seconds<>0 then raise exception 'monthly_claim_pool_invalid'; end if;
    if tg_op='INSERT' and new.status<>'DRAFT' then raise exception 'monthly_claim_must_start_draft'; end if;
    if tg_op='UPDATE' then
      if old.status='FINALIZED' then raise exception 'monthly_claim_finalized_immutable'; end if;
      if new.metric_id is distinct from old.metric_id or new.calendar_period is distinct from old.calendar_period or new.pool_units is distinct from old.pool_units or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.created_at is distinct from old.created_at then raise exception 'monthly_claim_published_config_immutable'; end if;
      if (old.status='DRAFT' and new.status not in ('DRAFT','PUBLISHED')) or (old.status='PUBLISHED' and new.status not in ('PUBLISHED','OPEN')) or (old.status='OPEN' and new.status not in ('OPEN','CLOSED')) or (old.status='CLOSED' and new.status not in ('CLOSED','FINALIZED')) then raise exception 'monthly_claim_transition_invalid'; end if;
      if old.status='DRAFT' and new.status='PUBLISHED' then new.published_at:=now(); end if;
      if old.status='PUBLISHED' and new.status='OPEN' and (now()<new.starts_at or now()>=new.ends_at) then raise exception 'monthly_claim_open_time_invalid'; end if;
      if old.status='OPEN' and new.status='CLOSED' then if now()<new.ends_at then raise exception 'monthly_claim_close_early'; end if; new.closed_at:=now(); end if;
    end if;
    return new;
  end if;
  if new.claim_units<>v_metric.human_claim_units or new.period_seconds<>v_metric.human_claim_period_seconds or new.budget_units>v_metric.human_claim_budget_units or v_metric.human_claim_units<=0 then raise exception 'cap_claim_epoch_metric_mismatch'; end if;
  if exists(select 1 from public.cap_human_claim_epochs e where e.metric_id=new.metric_id and e.id<>new.id and e.starts_at<new.ends_at and e.ends_at>new.starts_at) then raise exception 'cap_claim_epoch_overlap'; end if;
  select coalesce(sum(e.budget_units),0) into v_other_budget from public.cap_human_claim_epochs e where e.metric_id=new.metric_id and e.id<>new.id and e.claim_model='LEGACY_PERIODIC_V1';
  if v_other_budget+new.budget_units>v_metric.human_claim_budget_units then raise exception 'cap_claim_metric_budget_overallocated'; end if;
  if tg_op='INSERT' then if new.status<>'configured' then raise exception 'cap_claim_epoch_must_start_configured'; end if; return new; end if;
  if old.status='closed' then raise exception 'cap_claim_epoch_immutable'; end if;
  if old.status='active' and new.status not in ('active','closed') then raise exception 'cap_claim_epoch_immutable'; end if;
  if old.status='configured' and new.status not in ('configured','active') then raise exception 'cap_claim_epoch_invalid_transition'; end if;
  if new.status='active' and v_metric.status<>'published' then raise exception 'cap_claim_metric_not_published'; end if;
  if new.status='closed' then new.closed_at:=coalesce(new.closed_at,now()); end if;
  return new;
end; $$;

create or replace function public.worldcap_guard_immutable_cap_rows()
returns trigger language plpgsql set search_path = public, pg_temp as $$ begin raise exception 'cap_accounting_row_immutable'; end; $$;
create trigger cap_distributions_immutable before update or delete on public.cap_distributions for each row execute function public.worldcap_guard_immutable_cap_rows();
create trigger cap_monthly_participation_no_delete before delete on public.cap_monthly_claim_participations for each row execute function public.worldcap_guard_immutable_cap_rows();

create or replace function public.worldcap_guard_monthly_participation()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
  if new.epoch_id is distinct from old.epoch_id or new.user_id is distinct from old.user_id or new.registered_at is distinct from old.registered_at then raise exception 'monthly_participation_identity_immutable'; end if;
  if old.status='SETTLED' or not (old.status='REGISTERED' and new.status in ('REGISTERED','SETTLED')) then raise exception 'monthly_participation_transition_invalid'; end if;
  return new;
end; $$;
create trigger cap_monthly_participation_guard before update on public.cap_monthly_claim_participations for each row execute function public.worldcap_guard_monthly_participation();

create or replace function public.worldcap_guard_growth_campaign()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
  if tg_op='INSERT' then
    if new.status<>'DRAFT' or new.published_at is not null or new.distributed_units<>0 or new.reserved_units<>0 then raise exception 'growth_campaign_must_start_draft'; end if; return new;
  end if;
  if tg_op='DELETE' then if old.status<>'DRAFT' then raise exception 'growth_campaign_immutable'; end if; return old; end if;
  if old.status<>'DRAFT' and (new.version is distinct from old.version or new.name is distinct from old.name or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.budget_units is distinct from old.budget_units or new.config_commitment is distinct from old.config_commitment or new.published_at is distinct from old.published_at or new.accounting_mode is distinct from old.accounting_mode or new.created_at is distinct from old.created_at) then raise exception 'growth_campaign_config_immutable'; end if;
  if (old.status='DRAFT' and new.status not in ('DRAFT','PUBLISHED')) or (old.status='PUBLISHED' and new.status not in ('PUBLISHED','ACTIVE')) or (old.status='ACTIVE' and new.status not in ('ACTIVE','CLOSED')) or old.status='CLOSED' then raise exception 'growth_campaign_transition_invalid'; end if;
  if old.status='DRAFT' and new.status='PUBLISHED' then if now()>new.starts_at then raise exception 'growth_campaign_publish_after_start'; end if; new.published_at:=now(); end if;
  if old.status='PUBLISHED' and new.status='ACTIVE' and (now()<new.starts_at or now()>=new.ends_at) then raise exception 'growth_campaign_activation_time_invalid'; end if;
  if old.status='ACTIVE' and new.status='CLOSED' and now()<new.ends_at then raise exception 'growth_campaign_close_early'; end if;
  return new;
end; $$;
create trigger cap_growth_campaign_guard before insert or update or delete on public.cap_growth_campaigns for each row execute function public.worldcap_guard_growth_campaign();

create or replace function public.worldcap_guard_growth_quest()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
  if tg_op='DELETE' then
    if exists(select 1 from public.cap_growth_campaigns where id=old.campaign_id and status<>'DRAFT') then raise exception 'growth_quest_config_immutable_after_publish'; end if; return old;
  end if;
  if exists(select 1 from public.cap_growth_campaigns where id=new.campaign_id and status<>'DRAFT') then raise exception 'growth_quest_config_immutable_after_publish'; end if; return new;
end; $$;
create trigger cap_growth_quest_guard before update or delete on public.cap_growth_quests for each row execute function public.worldcap_guard_growth_quest();

create or replace function public.worldcap_apply_cap_distribution()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.cap_accounts(user_id,available_units,total_claimed_units)
  values(new.user_id,new.amount_units,new.amount_units)
  on conflict(user_id) do update set available_units=public.cap_accounts.available_units+excluded.available_units,total_claimed_units=public.cap_accounts.total_claimed_units+excluded.total_claimed_units,updated_at=now();
  return new;
end; $$;
create trigger cap_distribution_balance after insert on public.cap_distributions for each row execute function public.worldcap_apply_cap_distribution();

create or replace function public.worldcap_epoch_json(v public.cap_human_claim_epochs) returns jsonb
language sql stable set search_path=public,pg_temp as $$ select jsonb_build_object('id',v.id,'calendarPeriod',v.calendar_period,'status',v.status,'poolUnits',v.pool_units::text,'opensAt',v.starts_at,'closesAt',v.ends_at,'publishedAt',v.published_at,'closedAt',v.closed_at,'finalizedAt',v.finalized_at,'participantCount',v.participant_count::text,'settledUnitsPerHuman',case when v.settled_units_per_human is null then null else v.settled_units_per_human::text end,'unissuedRemainderUnits',case when v.unissued_remainder_units is null then null else v.unissued_remainder_units::text end) $$;

create or replace function public.worldcap_participation_json(v public.cap_monthly_claim_participations) returns jsonb
language sql stable set search_path=public,pg_temp as $$ select jsonb_build_object('id',v.id,'epochId',v.epoch_id,'userId',v.user_id,'status',v.status,'registeredAt',v.registered_at,'settledAt',v.settled_at,'settledUnits',v.settled_units::text) $$;

create or replace function public.worldcap_distribution_json(v public.cap_distributions) returns jsonb
language sql stable set search_path=public,pg_temp as $$ select jsonb_build_object('id',v.id,'source',v.source,'campaignId',v.campaign_id,'questId',v.quest_id,'userId',v.user_id,'amountUnits',v.amount_units::text,'reason',v.reason,'reference',v.reference,'createdAt',v.created_at) $$;

create or replace function public.worldcap_register_monthly_human_claim_v2(p_user_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_epoch public.cap_human_claim_epochs%rowtype; v_part public.cap_monthly_claim_participations%rowtype; v_replayed boolean:=false;
begin
  if not exists(select 1 from public.world_identities where user_id=p_user_id and verification_level='proof_of_human') then raise exception 'human_claim_verification_required'; end if;
  select * into v_epoch from public.cap_human_claim_epochs where claim_model='MONTHLY_EQUAL_POOL_V2' and status='OPEN' and now()>=starts_at and now()<ends_at order by starts_at desc limit 1 for update;
  if not found then raise exception 'human_claim_not_open'; end if;
  select * into v_part from public.cap_monthly_claim_participations where epoch_id=v_epoch.id and user_id=p_user_id;
  if found then v_replayed:=true; else
    insert into public.cap_monthly_claim_participations(epoch_id,user_id) values(v_epoch.id,p_user_id) returning * into v_part;
    update public.cap_human_claim_epochs set participant_count=participant_count+1 where id=v_epoch.id;
  end if;
  return jsonb_build_object('participation',public.worldcap_participation_json(v_part),'replayed',v_replayed);
end; $$;

create or replace function public.worldcap_finalize_monthly_human_claim_v2(p_epoch_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_epoch public.cap_human_claim_epochs%rowtype; v_count numeric(78,0); v_each numeric(78,0); v_remainder numeric(78,0); v_part public.cap_monthly_claim_participations%rowtype; v_dist public.cap_distributions%rowtype; v_rows jsonb:='[]'::jsonb;
begin
  select * into v_epoch from public.cap_human_claim_epochs where id=p_epoch_id and claim_model='MONTHLY_EQUAL_POOL_V2' for update;
  if not found then raise exception 'human_claim_epoch_not_found'; end if;
  if v_epoch.status='FINALIZED' then return jsonb_build_object('epoch',public.worldcap_epoch_json(v_epoch),'replayed',true,'settlements','[]'::jsonb); end if;
  if v_epoch.status<>'CLOSED' or now()<v_epoch.ends_at then raise exception 'human_claim_epoch_not_closed'; end if;
  select count(*) into v_count from public.cap_monthly_claim_participations where epoch_id=v_epoch.id;
  if v_count=0 then v_each:=0; v_remainder:=v_epoch.pool_units; else v_each:=floor(v_epoch.pool_units/v_count); v_remainder:=v_epoch.pool_units-(v_each*v_count); end if;
  for v_part in select * from public.cap_monthly_claim_participations where epoch_id=v_epoch.id order by user_id for update loop
    insert into public.cap_distributions(source,user_id,amount_units,reason,reference) values('HUMAN_CLAIM',v_part.user_id,v_each,'Monthly Human Claim '||v_epoch.calendar_period,'human-claim:'||v_epoch.id||':'||v_part.user_id) returning * into v_dist;
    update public.cap_monthly_claim_participations set status='SETTLED',settled_at=now(),settled_units=v_each where id=v_part.id;
    v_rows:=v_rows||jsonb_build_array(public.worldcap_distribution_json(v_dist));
  end loop;
  update public.cap_human_claim_epochs set status='FINALIZED',finalized_at=now(),participant_count=v_count,settled_units_per_human=v_each,unissued_remainder_units=v_remainder where id=v_epoch.id returning * into v_epoch;
  return jsonb_build_object('epoch',public.worldcap_epoch_json(v_epoch),'replayed',false,'settlements',v_rows);
end; $$;

create or replace function public.worldcap_referral_code(p_user_id text) returns text
language sql immutable set search_path=public,pg_temp as $$ select upper(substr(encode(digest('worldcap-referral-v1|'||p_user_id,'sha256'),'hex'),1,16)) $$;

create or replace function public.worldcap_register_genesis_referral(p_user_id text,p_inviter_code text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_inviter text; v_existing public.cap_genesis_referrals%rowtype; v_created public.cap_genesis_referrals%rowtype;
begin
  if not exists(select 1 from public.world_identities where user_id=p_user_id and verification_level='proof_of_human') then raise exception 'referral_human_required'; end if;
  select u.id into v_inviter from public.users u join public.world_identities wi on wi.user_id=u.id where public.worldcap_referral_code(u.id)=upper(trim(p_inviter_code)) and wi.verification_level='proof_of_human';
  if v_inviter is null or v_inviter=p_user_id then raise exception 'referral_invalid'; end if;
  select * into v_existing from public.cap_genesis_referrals where referee_user_id=p_user_id;
  if found then if v_existing.inviter_user_id<>v_inviter then raise exception 'referral_already_bound'; end if; return jsonb_build_object('referralId',v_existing.id,'replayed',true); end if;
  if exists(select 1 from public.posts p join public.profiles pr on pr.id=p.profile_id where pr.user_id=p_user_id) or exists(select 1 from public.purchases p where p.user_id=p_user_id and p.status='settled' and p.settlement_mode='verified') then raise exception 'referral_must_precede_qualification'; end if;
  insert into public.cap_genesis_referrals(inviter_user_id,referee_user_id,inviter_code) values(v_inviter,p_user_id,upper(trim(p_inviter_code))) returning * into v_created;
  return jsonb_build_object('referralId',v_created.id,'replayed',false);
end; $$;

create or replace function public.worldcap_create_social_post(p_user_id text,p_body text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_profile uuid; v_post public.posts%rowtype; v_clean text:=trim(p_body);
begin
  if char_length(v_clean)<1 or char_length(v_clean)>240 then raise exception 'social_post_invalid'; end if;
  select id into v_profile from public.profiles where user_id=p_user_id;
  if v_profile is null then insert into public.profiles(user_id,display_name) select p_user_id,username from public.users where id=p_user_id returning id into v_profile; end if;
  if v_profile is null then raise exception 'profile_not_found'; end if;
  insert into public.posts(profile_id,kind,body) values(v_profile,'member',v_clean) returning * into v_post;
  update public.cap_genesis_referrals set qualified_at=coalesce(qualified_at,now()),qualification_reference='social-post:'||v_post.id where referee_user_id=p_user_id and qualified_at is null;
  return jsonb_build_object('id',v_post.id,'body',v_post.body,'createdAt',v_post.created_at);
end; $$;

create or replace function public.worldcap_evaluate_genesis_quest(p_user_id text,p_quest_id uuid,p_reserve boolean default true) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quest public.cap_growth_quests%rowtype; v_campaign public.cap_growth_campaigns%rowtype; v_progress public.cap_growth_progress%rowtype; v_current numeric(78,0):=0; v_required numeric(78,0):=1; v_qualified boolean:=false; v_count numeric(78,0);
begin
  if not exists(select 1 from public.world_identities where user_id=p_user_id and verification_level='proof_of_human') then raise exception 'growth_human_required'; end if;
  select * into strict v_quest from public.cap_growth_quests where id=p_quest_id;
  if p_reserve then select * into strict v_campaign from public.cap_growth_campaigns where id=v_quest.campaign_id for update;
  else select * into strict v_campaign from public.cap_growth_campaigns where id=v_quest.campaign_id; end if;
  if v_campaign.status<>'ACTIVE' or now()<v_campaign.starts_at or now()>=v_campaign.ends_at or v_quest.status<>'ACTIVE' then raise exception 'growth_campaign_not_active'; end if;
  select * into v_progress from public.cap_growth_progress where quest_id=v_quest.id and user_id=p_user_id;
  if found and v_progress.status in ('QUALIFIED','CLAIMED') then return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status',v_progress.status,'progressCurrent','1','progressRequired','1','reason',null); end if;
  if v_quest.verification_mode='EXTERNAL' then return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status','UNAVAILABLE','progressCurrent','0','progressRequired','1','reason','Authoritative verification provider unavailable'); end if;
  if v_quest.kind='VERIFIED_PROFILE' then select count(*) into v_current from public.profiles where user_id=p_user_id; v_qualified:=v_current>0;
  elsif v_quest.kind='FIRST_SOCIAL_POST' then select count(*) into v_current from public.posts p join public.profiles pr on pr.id=p.profile_id where pr.user_id=p_user_id and p.kind='member'; v_qualified:=v_current>0;
  elsif v_quest.kind='VERIFIED_REFERRAL' then select count(*) into v_current from public.cap_genesis_referrals where inviter_user_id=p_user_id and qualified_at is not null; v_qualified:=v_current>0;
  elsif v_quest.kind='TITLE_COUNT_MILESTONE' then v_required:=v_quest.milestone_threshold; select count(*) into v_current from public.titles t join public.purchases p on p.id=t.purchase_id where t.current_owner_id=p_user_id and p.status='settled' and p.settlement_mode='verified'; v_qualified:=v_current>=v_required;
  elsif v_quest.kind='FIRST_COSMETIC_PURCHASE_REBATE' then select count(*) into v_current from public.cap_cosmetic_purchases where user_id=p_user_id; v_qualified:=v_current>0;
  end if;
  if not v_qualified then return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status',case when v_current>0 then 'IN_PROGRESS' else 'LOCKED' end,'progressCurrent',v_current::text,'progressRequired',v_required::text,'reason',null); end if;
  select count(*) into v_count from public.cap_growth_progress where quest_id=v_quest.id and status in ('QUALIFIED','CLAIMED');
  if v_quest.max_rewarded_completions is not null and v_count>=v_quest.max_rewarded_completions then return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status','UNAVAILABLE','progressCurrent',v_current::text,'progressRequired',v_required::text,'reason','Published quest capacity exhausted'); end if;
  if v_campaign.distributed_units+v_campaign.reserved_units+v_quest.reward_units>v_campaign.budget_units then return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status','UNAVAILABLE','progressCurrent',v_current::text,'progressRequired',v_required::text,'reason','Published campaign budget exhausted'); end if;
  if p_reserve then
    insert into public.cap_growth_progress(campaign_id,quest_id,user_id,status,qualified_at) values(v_campaign.id,v_quest.id,p_user_id,'QUALIFIED',now()) on conflict(quest_id,user_id) do nothing;
    if found then update public.cap_growth_campaigns set reserved_units=reserved_units+v_quest.reward_units where id=v_campaign.id; end if;
  end if;
  return jsonb_build_object('questId',v_quest.id,'code',v_quest.code,'kind',v_quest.kind,'verificationMode',v_quest.verification_mode,'rewardUnits',v_quest.reward_units::text,'status','QUALIFIED','progressCurrent',v_current::text,'progressRequired',v_required::text,'reason',null);
end; $$;

create or replace function public.worldcap_claim_genesis_reward(p_user_id text,p_quest_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_quest public.cap_growth_quests%rowtype; v_campaign public.cap_growth_campaigns%rowtype; v_progress public.cap_growth_progress%rowtype; v_dist public.cap_distributions%rowtype; v_reference text;
begin
  select * into strict v_quest from public.cap_growth_quests where id=p_quest_id; select * into strict v_campaign from public.cap_growth_campaigns where id=v_quest.campaign_id for update; v_reference:='genesis-growth:'||v_campaign.id||':'||v_quest.id||':'||p_user_id;
  select * into v_dist from public.cap_distributions where reference=v_reference; if found then return jsonb_build_object('distribution',public.worldcap_distribution_json(v_dist),'replayed',true); end if;
  perform public.worldcap_evaluate_genesis_quest(p_user_id,p_quest_id);
  select * into v_progress from public.cap_growth_progress where quest_id=v_quest.id and user_id=p_user_id for update;
  if not found or v_progress.status<>'QUALIFIED' then raise exception 'growth_quest_not_qualified'; end if;
  insert into public.cap_distributions(source,campaign_id,quest_id,user_id,amount_units,reason,reference) values('GENESIS_GROWTH',v_campaign.id,v_quest.id,p_user_id,v_quest.reward_units,v_quest.code,v_reference) returning * into v_dist;
  update public.cap_growth_progress set status='CLAIMED',claimed_at=now() where id=v_progress.id;
  update public.cap_growth_campaigns set reserved_units=reserved_units-v_quest.reward_units,distributed_units=distributed_units+v_quest.reward_units where id=v_campaign.id;
  return jsonb_build_object('distribution',public.worldcap_distribution_json(v_dist),'replayed',false);
end; $$;

create or replace function public.worldcap_cap_totals_json(p_user_id text default null) returns jsonb
language sql stable set search_path=public,pg_temp as $$
with d as (select source,coalesce(sum(amount_units),0) units from public.cap_distributions where p_user_id is null or user_id=p_user_id group by source),
t as (select coalesce(sum(e.entitlement_units) filter(where e.redemption_state='claimed' and (p_user_id is null or e.claimed_by_user_id=p_user_id)),0) title_claimed,coalesce(sum(e.entitlement_units) filter(where e.redemption_state='locked' and (p_user_id is null or ti.current_owner_id=p_user_id)),0) title_locked,coalesce(sum(e.entitlement_units) filter(where e.redemption_state='available' and (p_user_id is null or ti.current_owner_id=p_user_id)),0) title_available from public.title_cap_entitlements e join public.titles ti on ti.id=e.title_id),
a as (select coalesce(sum(spent_units),0) spent,coalesce(sum(burned_units),0) burned from public.cap_accounts where p_user_id is null or user_id=p_user_id)
select jsonb_build_object('titleEntitlementUnits',t.title_claimed::text,'humanClaimUnits',coalesce((select units from d where source='HUMAN_CLAIM'),0)::text,'genesisGrowthUnits',coalesce((select units from d where source='GENESIS_GROWTH'),0)::text,'otherFutureUnits',coalesce((select units from d where source='OTHER_FUTURE'),0)::text,'availableUnits',(t.title_claimed+t.title_available+coalesce((select sum(units) from d),0)-a.spent-a.burned)::text,'lockedUnits',t.title_locked::text,'spentUnits',a.spent::text,'burnedUnits',a.burned::text,'totalClaimedUnits',(t.title_claimed+coalesce((select sum(units) from d),0))::text) from t,a $$;

-- Journey, founder, and public summary RPCs intentionally expose aggregate/privacy-safe data only.
create or replace function public.worldcap_get_genesis_journey(p_user_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_epoch public.cap_human_claim_epochs%rowtype; v_part public.cap_monthly_claim_participations%rowtype; v_campaign public.cap_growth_campaigns%rowtype; v_quests jsonb:='[]'::jsonb; v_q public.cap_growth_quests%rowtype; v_eval jsonb; v_est numeric(78,0);
begin
  select * into v_epoch from public.cap_human_claim_epochs where claim_model='MONTHLY_EQUAL_POOL_V2' and calendar_period=to_char(timezone('UTC',now()),'YYYY-MM') order by starts_at desc limit 1;
  if found then select * into v_part from public.cap_monthly_claim_participations where epoch_id=v_epoch.id and user_id=p_user_id; if v_epoch.status='OPEN' then v_est:=floor(v_epoch.pool_units/(v_epoch.participant_count+case when v_part.id is null then 1 else 0 end)); end if; end if;
  select * into v_campaign from public.cap_growth_campaigns where status='ACTIVE' and now()>=starts_at and now()<ends_at order by starts_at desc limit 1;
  if found then for v_q in select * from public.cap_growth_quests where campaign_id=v_campaign.id and status='ACTIVE' order by code loop v_eval:=public.worldcap_evaluate_genesis_quest(p_user_id,v_q.id,false); v_quests:=v_quests||jsonb_build_array(v_eval); end loop; end if;
  return jsonb_build_object('campaign',case when v_campaign.id is null then null else jsonb_build_object('id',v_campaign.id,'version',v_campaign.version,'name',v_campaign.name,'startsAt',v_campaign.starts_at,'endsAt',v_campaign.ends_at,'status',v_campaign.status,'budgetUnits',v_campaign.budget_units::text,'publishedAt',v_campaign.published_at,'configCommitment',v_campaign.config_commitment,'distributedUnits',v_campaign.distributed_units::text,'reservedUnits',v_campaign.reserved_units::text,'remainingUnits',(v_campaign.budget_units-v_campaign.distributed_units-v_campaign.reserved_units)::text) end,'quests',v_quests,'cap',public.worldcap_cap_totals_json(p_user_id),'referralCode',public.worldcap_referral_code(p_user_id),'humanClaim',jsonb_build_object('available',coalesce(v_epoch.status='OPEN',false),'reason',case when v_epoch.id is null then 'No published monthly pool is open' when v_epoch.status<>'OPEN' then 'Monthly pool is not open' else null end,'epoch',case when v_epoch.id is null then null else public.worldcap_epoch_json(v_epoch) end,'participation',coalesce(v_part.status,'NOT_CLAIMED'),'settledUnits',coalesce(v_part.settled_units,0)::text,'estimatedUnits',case when v_est is null then null else v_est::text end,'estimateLabel',case when v_est is null then null else 'ESTIMATE' end));
end; $$;

create or replace function public.worldcap_founder_control_metrics() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.cap_human_claim_epochs%rowtype;
  previous_e public.cap_human_claim_epochs%rowtype;
  c public.cap_growth_campaigns%rowtype;
  active_campaign public.campaigns%rowtype;
  monthly_draw public.draws%rowtype;
  quarterly_draw public.draws%rowtype;
  latest_draw public.draws%rowtype;
  latest_job public.draw_coordinator_jobs%rowtype;
  q jsonb;
begin
  select * into e from public.cap_human_claim_epochs where claim_model='MONTHLY_EQUAL_POOL_V2' order by starts_at desc limit 1;
  if e.id is not null then select * into previous_e from public.cap_human_claim_epochs where claim_model='MONTHLY_EQUAL_POOL_V2' and calendar_period<e.calendar_period order by calendar_period desc limit 1; end if;
  select * into c from public.cap_growth_campaigns order by starts_at desc limit 1;
  select * into active_campaign from public.campaigns where status='active' order by sales_open_at desc limit 1;
  select * into monthly_draw from public.draws where kind='monthly' order by closes_at desc limit 1;
  select * into quarterly_draw from public.draws where kind='quarterly' order by closes_at desc limit 1;
  select * into latest_draw from public.draws where kind in ('monthly','quarterly') order by closes_at desc limit 1;
  if latest_draw.id is not null then select * into latest_job from public.draw_coordinator_jobs where draw_id=latest_draw.id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('questId',quest.id,'qualified',quest.qualified::text,'claimed',quest.claimed::text,'distributedUnits',quest.distributed::text)),'[]'::jsonb) into q from (select qu.id,count(pr.id) filter(where pr.status='QUALIFIED') qualified,count(pr.id) filter(where pr.status='CLAIMED') claimed,coalesce(sum(d.amount_units),0) distributed from public.cap_growth_quests qu left join public.cap_growth_progress pr on pr.quest_id=qu.id left join public.cap_distributions d on d.quest_id=qu.id where c.id is not null and qu.campaign_id=c.id group by qu.id) quest;
  return jsonb_build_object(
    'generatedAt',now(),
    'humanClaim',jsonb_build_object(
      'period',e.calendar_period,'poolUnits',coalesce(e.pool_units,0)::text,'participants',coalesce(e.participant_count,0)::text,
      'settledUnits',(coalesce(e.settled_units_per_human,0)*coalesce(e.participant_count,0))::text,'settledUnitsPerHuman',coalesce(e.settled_units_per_human,0)::text,
      'unissuedUnits',coalesce(e.unissued_remainder_units,0)::text,'previousPeriodParticipants',coalesce(previous_e.participant_count,0)::text,
      'participantGrowthBps',case when coalesce(previous_e.participant_count,0)>0 then floor(((coalesce(e.participant_count,0)-previous_e.participant_count)*10000)/previous_e.participant_count)::text else null end,
      'projectedShare2x',case when coalesce(e.participant_count,0)>0 then floor(e.pool_units/(e.participant_count*2))::text else '0' end,
      'projectedShare5x',case when coalesce(e.participant_count,0)>0 then floor(e.pool_units/(e.participant_count*5))::text else '0' end,
      'projectedShare10x',case when coalesce(e.participant_count,0)>0 then floor(e.pool_units/(e.participant_count*10))::text else '0' end),
    'product',jsonb_build_object(
      'users',(select count(*)::text from public.users),'verifiedHumans',(select count(*)::text from public.world_identities where verification_level='proof_of_human'),
      'titlesIssued',(select count(*)::text from public.titles),'settledPurchases',(select count(*)::text from public.purchases where status='settled'),
      'activeCampaignId',active_campaign.id,'monthlyDrawStatus',monthly_draw.status,'quarterlyDrawStatus',quarterly_draw.status),
    'genesis',jsonb_build_object('campaignId',c.id,'budgetUnits',coalesce(c.budget_units,0)::text,'distributedUnits',coalesce(c.distributed_units,0)::text,'reservedUnits',coalesce(c.reserved_units,0)::text,'remainingUnits',(coalesce(c.budget_units,0)-coalesce(c.distributed_units,0)-coalesce(c.reserved_units,0))::text,'participants',(select count(distinct user_id)::text from public.cap_distributions where source='GENESIS_GROWTH' and (c.id is null or campaign_id=c.id)),'byQuest',q,'verifiedReferrals',(select count(*)::text from public.cap_genesis_referrals where qualified_at is not null),'milestoneQualifications',(select count(*)::text from public.cap_growth_progress pr join public.cap_growth_quests qu on qu.id=pr.quest_id where qu.kind='TITLE_COUNT_MILESTONE' and pr.status in ('QUALIFIED','CLAIMED')),'externalPending',(select count(*)::text from public.cap_growth_progress pr join public.cap_growth_quests qu on qu.id=pr.quest_id where qu.verification_mode='EXTERNAL' and pr.status='PENDING_VERIFICATION')),
    'cap',public.worldcap_cap_totals_json(null),
    'trust',jsonb_build_object(
      'immutableLedgerRows',(select count(*)::text from public.cap_distributions),'accountingMode','simulated','productionTokenTransfers',false,
      'latestDrawId',latest_draw.id,'manifestCommitment',latest_draw.eligibility_commitment,'randomnessStatus',coalesce(latest_job.status,'NOT_REQUESTED'),
      'externalProofStatus',case when latest_job.proof_reference is not null then 'PRESENT' when latest_job.status in ('fulfilled','resolved') then 'MISSING' else 'NOT_AVAILABLE' end,
      'anchorStatus','EXTERNAL_NOT_RECORDED','verifyDrawStatus',case when latest_draw.status in ('resolved','settled') and latest_draw.winning_title_id is not null then 'READY_FOR_RECOMPUTE' else 'NOT_AVAILABLE' end),
    'operations',jsonb_build_object(
      'reconciliationPending',(select count(*)::text from public.payment_reconciliation_jobs where status in ('pending','processing','failed')),
      'reconciliationFailedOrStuck',(select count(*)::text from public.payment_reconciliation_jobs where status in ('failed','stuck')),
      'drawJobsFailed',(select count(*)::text from public.draw_coordinator_jobs where status='failed'),'readinessStatus','DATABASE_REACHABLE'));
end; $$;

create or replace function public.worldcap_public_cap_fairness_summary() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.cap_human_claim_epochs%rowtype; c public.cap_growth_campaigns%rowtype;
begin select * into e from public.cap_human_claim_epochs where claim_model='MONTHLY_EQUAL_POOL_V2' order by starts_at desc limit 1; select * into c from public.cap_growth_campaigns where status<>'DRAFT' order by starts_at desc limit 1;
return jsonb_build_object('generatedAt',now(),'accountingMode','simulated','sources',public.worldcap_cap_totals_json(null),'humanClaim',jsonb_build_object('calendarPeriod',e.calendar_period,'status',e.status,'poolUnits',coalesce(e.pool_units,0)::text,'participantCount',coalesce(e.participant_count,0)::text,'settledUnitsPerHuman',case when e.settled_units_per_human is null then null else e.settled_units_per_human::text end,'unissuedRemainderUnits',case when e.unissued_remainder_units is null then null else e.unissued_remainder_units::text end),'genesis',jsonb_build_object('campaignId',c.id,'version',c.version,'budgetUnits',coalesce(c.budget_units,0)::text,'distributedUnits',coalesce(c.distributed_units,0)::text,'remainingUnits',(coalesce(c.budget_units,0)-coalesce(c.distributed_units,0)-coalesce(c.reserved_units,0))::text)); end; $$;

-- Title CAP claims now write the explicit source ledger exactly once.
create or replace function public.worldcap_claim_title_cap(p_user_id text,p_title_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cap public.title_cap_entitlements%rowtype; v_owner text; v_reference text; v_dist public.cap_distributions%rowtype;
begin
  select current_owner_id into strict v_owner from public.titles where id=p_title_id for update; if v_owner<>p_user_id then raise exception 'title_not_owned'; end if;
  select * into strict v_cap from public.title_cap_entitlements where title_id=p_title_id for update;
  if v_cap.redemption_state='locked' then raise exception 'cap_redemption_not_available'; end if; if v_cap.redemption_state='expired' then raise exception 'cap_redemption_expired'; end if;
  v_reference:='title-entitlement:'||p_title_id;
  select * into v_dist from public.cap_distributions where reference=v_reference;
  if found then if v_dist.user_id<>p_user_id then raise exception 'cap_redemption_already_claimed'; end if; return jsonb_build_object('replayed',true,'title_id',p_title_id,'claimed_units',v_cap.entitlement_units::text,'draw_eligible',true); end if;
  insert into public.cap_distributions(source,campaign_id,user_id,amount_units,reason,reference) values('TITLE_ENTITLEMENT',v_cap.campaign_id,p_user_id,v_cap.entitlement_units,'Title CAP entitlement',v_reference);
  update public.title_cap_entitlements set redemption_state='claimed',claimed_at=now(),claimed_by_user_id=p_user_id where title_id=p_title_id;
  return jsonb_build_object('replayed',false,'title_id',p_title_id,'claimed_units',v_cap.entitlement_units::text,'draw_eligible',true);
end; $$;

do $$ declare t text; begin foreach t in array array['cap_monthly_claim_participations','cap_growth_campaigns','cap_growth_quests','cap_growth_progress','cap_genesis_referrals','cap_cosmetic_purchases','cap_distributions'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on table public.%I from public,anon,authenticated',t); end loop; end $$;

revoke all on function public.worldcap_register_monthly_human_claim_v2(text) from public,anon,authenticated;
revoke all on function public.worldcap_finalize_monthly_human_claim_v2(uuid) from public,anon,authenticated;
revoke all on function public.worldcap_register_genesis_referral(text,text) from public,anon,authenticated;
revoke all on function public.worldcap_create_social_post(text,text) from public,anon,authenticated;
revoke all on function public.worldcap_evaluate_genesis_quest(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.worldcap_claim_genesis_reward(text,uuid) from public,anon,authenticated;
revoke all on function public.worldcap_get_genesis_journey(text) from public,anon,authenticated;
revoke all on function public.worldcap_founder_control_metrics() from public,anon,authenticated;
revoke all on function public.worldcap_public_cap_fairness_summary() from public,anon,authenticated;
revoke all on function public.worldcap_epoch_json(public.cap_human_claim_epochs) from public,anon,authenticated;
revoke all on function public.worldcap_participation_json(public.cap_monthly_claim_participations) from public,anon,authenticated;
revoke all on function public.worldcap_distribution_json(public.cap_distributions) from public,anon,authenticated;
revoke all on function public.worldcap_cap_totals_json(text) from public,anon,authenticated;
revoke all on function public.worldcap_referral_code(text) from public,anon,authenticated;
grant execute on function public.worldcap_register_monthly_human_claim_v2(text),public.worldcap_finalize_monthly_human_claim_v2(uuid),public.worldcap_register_genesis_referral(text,text),public.worldcap_create_social_post(text,text),public.worldcap_evaluate_genesis_quest(text,uuid,boolean),public.worldcap_claim_genesis_reward(text,uuid),public.worldcap_get_genesis_journey(text),public.worldcap_founder_control_metrics(),public.worldcap_public_cap_fairness_summary() to service_role;
grant execute on function public.worldcap_epoch_json(public.cap_human_claim_epochs),public.worldcap_participation_json(public.cap_monthly_claim_participations),public.worldcap_distribution_json(public.cap_distributions),public.worldcap_cap_totals_json(text),public.worldcap_referral_code(text) to service_role;

-- Retire mutation access to superseded mechanics while preserving their tables
-- and rows for historical reads/migration provenance.
revoke execute on function public.worldcap_claim_human_cap(text,uuid) from service_role;
revoke execute on function public.worldprize_reveal_scratch(text,uuid,numeric,text,text) from service_role;

comment on table public.cap_monthly_claim_participations is 'One verified-human registration per UTC calendar month. Registration carries zero CAP; only finalized settlement credits CAP.';
comment on table public.cap_distributions is 'Immutable simulated CAP source ledger. No on-chain token transfer or production monetary claim.';
comment on table public.cap_growth_campaigns is 'Budget-first Genesis Growth campaigns; configuration is published before activation and no reward amount is seeded by this migration.';
