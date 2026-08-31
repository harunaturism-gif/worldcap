-- WorldPrize MVP domain schema. All client roles are denied by RLS; the server-only
-- service role is the sole persistence path until narrower policies are designed.
create extension if not exists pgcrypto;

create table public.users (
  id text primary key check (id ~ '^user_[0-9a-f]{64}$'),
  username text not null unique check (username ~ '^Human_[0-9A-F]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.world_identities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.users(id) on delete cascade,
  rp_id text not null check (rp_id ~ '^rp_[A-Za-z0-9_-]{4,}$'),
  verification_level text not null check (verification_level = 'proof_of_human'),
  world_session_hash text not null unique check (world_session_hash ~ '^[0-9a-f]{64}$'),
  last_verified_at timestamptz not null
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(), user_id text not null unique references public.users(id),
  asset text not null default 'WLD' check (asset = 'WLD'), available numeric(24,8) not null default 0 check (available >= 0), updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(), name text not null, month_label text not null,
  status text not null check (status in ('scheduled','active','closed')), title_price numeric(24,8) not null check (title_price > 0),
  sales_open_at timestamptz not null, sales_close_at timestamptz not null, monthly_draw_at timestamptz not null, annual_draw_at timestamptz not null,
  check (sales_open_at < sales_close_at)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(), user_id text not null references public.users(id), campaign_id uuid not null references public.campaigns(id),
  quantity integer not null check (quantity between 1 and 10), unit_price numeric(24,8) not null check (unit_price > 0), total numeric(24,8) not null check (total > 0),
  status text not null check (status in ('pending','settled','failed')), chain_tx_hash text unique, created_at timestamptz not null default now()
);

create table public.titles (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id), serial text not null unique,
  issue_price numeric(24,8) not null check (issue_price > 0), issued_at timestamptz not null default now()
);

create table public.title_ownership (
  id uuid primary key default gen_random_uuid(), title_id uuid not null unique references public.titles(id), user_id text not null references public.users(id),
  purchase_id uuid not null references public.purchases(id), acquired_at timestamptz not null default now(), scratched_at timestamptz,
  draw_eligible boolean not null default true check (draw_eligible = true)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.wallets(id),
  kind text not null check (kind in ('deposit','title_purchase','scratch_prize','draw_prize','withdrawal')),
  direction text not null check (direction in ('credit','debit')), amount numeric(24,8) not null check (amount > 0),
  reference_id text not null, description text not null, created_at timestamptz not null default now()
);

create table public.treasury_allocations (
  id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.purchases(id),
  bucket text not null check (bucket in ('monthly_prize_pool','annual_jackpot','platform_operations','commercial_growth')),
  percentage integer not null check (percentage in (10,20,60)), amount numeric(24,8) not null check (amount >= 0), chain_tx_hash text,
  unique (purchase_id, bucket)
);

create table public.scratch_games (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null unique references public.campaigns(id),
  status text not null check (status in ('active','closed')), reveal_limit_per_title integer not null default 1 check (reveal_limit_per_title = 1)
);

create table public.scratch_results (
  id uuid primary key default gen_random_uuid(), scratch_game_id uuid not null references public.scratch_games(id), title_id uuid not null unique references public.titles(id),
  prize_amount numeric(24,8) not null check (prize_amount >= 0), randomness_reference text not null, revealed_at timestamptz not null default now()
);

create table public.draws (
  id uuid primary key default gen_random_uuid(), campaign_id uuid references public.campaigns(id), kind text not null check (kind in ('monthly','annual')),
  scheduled_at timestamptz not null, status text not null check (status in ('scheduled','complete'))
);

create table public.draw_entries (
  id uuid primary key default gen_random_uuid(), draw_id uuid not null references public.draws(id), title_id uuid not null references public.titles(id),
  ownership_id uuid not null references public.title_ownership(id), unique (draw_id, title_id)
);

create table public.draw_results (
  id uuid primary key default gen_random_uuid(), draw_id uuid not null unique references public.draws(id), winning_title_id uuid not null references public.titles(id),
  prize_amount numeric(24,8) not null check (prize_amount > 0), randomness_reference text not null, published_at timestamptz not null
);

create table public.prize_vaults (
  id uuid primary key default gen_random_uuid(), campaign_id uuid references public.campaigns(id), kind text not null check (kind in ('monthly','annual')),
  asset text not null default 'WLD' check (asset = 'WLD'), balance numeric(24,8) not null default 0 check (balance >= 0), chain_address text,
  unique nulls not distinct (campaign_id, kind)
);

create table public.prize_liabilities (
  id uuid primary key default gen_random_uuid(), user_id text not null references public.users(id), source text not null check (source in ('scratch','draw')),
  source_id uuid not null, amount numeric(24,8) not null check (amount > 0), status text not null check (status in ('pending','settled','void')),
  created_at timestamptz not null default now(), unique (source, source_id)
);

create table public.prize_claims (
  id uuid primary key default gen_random_uuid(), liability_id uuid not null unique references public.prize_liabilities(id), user_id text not null references public.users(id),
  amount numeric(24,8) not null check (amount > 0), status text not null check (status in ('pending','claimed','rejected')),
  claimed_at timestamptz, settlement_tx_hash text unique
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(), user_id text not null unique references public.users(id), display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text, created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('member','purchase_activity','winner_activity','jackpot_milestone')),
  body text not null check (char_length(body) between 1 and 240), reference_id text, created_at timestamptz not null default now()
);

create table public.follows (
  follower_profile_id uuid not null references public.profiles(id), followed_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), primary key (follower_profile_id, followed_profile_id), check (follower_profile_id <> followed_profile_id)
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id), profile_id uuid not null references public.profiles(id),
  kind text not null default 'celebrate' check (kind = 'celebrate'), created_at timestamptz not null default now(), unique (post_id, profile_id, kind)
);

create index title_ownership_user_idx on public.title_ownership(user_id, acquired_at desc);
create index ledger_entries_wallet_idx on public.ledger_entries(wallet_id, created_at desc);
create index posts_created_idx on public.posts(created_at desc);
create index draw_entries_title_idx on public.draw_entries(title_id);
create index prize_claims_user_idx on public.prize_claims(user_id, status);

do $$ declare table_name text; begin
  foreach table_name in array array['users','world_identities','wallets','campaigns','titles','title_ownership','purchases','ledger_entries','treasury_allocations','scratch_games','scratch_results','draws','draw_entries','draw_results','prize_vaults','prize_liabilities','prize_claims','profiles','posts','follows','reactions']
  loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

