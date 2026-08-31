-- Durable, operator-visible World Pay confirmation reconciliation queue.
-- It never issues titles directly: the worker must call the existing idempotent
-- verification and completion boundary with the stored reference/transaction.

create table public.payment_reconciliation_jobs (
  id uuid primary key default gen_random_uuid(),
  purchase_reference uuid not null unique references public.purchase_intents(reference),
  transaction_id text not null unique check (transaction_id ~ '^[A-Za-z0-9_-]{8,200}$'),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','stuck')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  completed_purchase_id uuid references public.purchases(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_reconciliation_due_idx on public.payment_reconciliation_jobs(next_attempt_at, created_at) where status in ('pending','failed');

alter table public.payment_reconciliation_jobs enable row level security;
revoke all on table public.payment_reconciliation_jobs from public, anon, authenticated;
grant select, insert, update on table public.payment_reconciliation_jobs to service_role;

create or replace function public.worldcap_claim_reconciliation_jobs(p_worker text, p_limit integer default 25)
returns setof public.payment_reconciliation_jobs language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if p_worker !~ '^[A-Za-z0-9._:-]{3,100}$' or p_limit < 1 or p_limit > 100 then raise exception 'reconciliation_claim_invalid'; end if;
  return query
    with claimed as (
      select id from public.payment_reconciliation_jobs
      where status in ('pending','failed') and next_attempt_at <= statement_timestamp()
        and (locked_at is null or locked_at < statement_timestamp() - interval '5 minutes')
      order by next_attempt_at, created_at for update skip locked limit p_limit
    )
    update public.payment_reconciliation_jobs job set
      status = 'processing', locked_at = statement_timestamp(), locked_by = p_worker,
      attempt_count = attempt_count + 1, updated_at = statement_timestamp()
    from claimed where job.id = claimed.id returning job.*;
end;
$$;

revoke all on function public.worldcap_claim_reconciliation_jobs(text,integer) from public, anon, authenticated;
grant execute on function public.worldcap_claim_reconciliation_jobs(text,integer) to service_role;
comment on table public.payment_reconciliation_jobs is 'Service-role-only queue for delayed World Developer Portal payment verification; title issuance remains delegated to the atomic idempotent purchase RPC.';
