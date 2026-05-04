-- FinanceOS Phase 1 Supabase schema
-- Goal: single-user cloud persistence with a clean path to multi-user isolation later.
-- Notes:
-- - IDs remain text to match the current app's generated string IDs.
-- - Every table is user-owned through user_id.
-- - Business stays as a single JSON payload row in phase 1 to avoid a risky early domain split.

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  currency text not null default 'CAD',
  opening_balance numeric(12,2) not null default 0,
  balance_base numeric(12,2),
  reconciled_balance numeric(12,2),
  reconciled_date date,
  active boolean not null default true,
  created_at timestamptz not null,
  primary_flag boolean not null default false
);

create table if not exists public.credit_cards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  issuer text not null,
  type text not null,
  limit_amount numeric(12,2) not null default 0,
  opening_balance numeric(12,2) not null default 0,
  balance_base numeric(12,2),
  reconciled_balance numeric(12,2),
  reconciled_date date,
  linked_account_id text,
  active boolean not null default true,
  created_at timestamptz not null,
  primary_flag boolean not null default false
);

create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  color text,
  vehicle_linked boolean not null default false,
  property_linked boolean not null default false,
  archived boolean not null default false
);

create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  sub_type text,
  amount numeric(12,2) not null,
  interest_amount numeric(12,2),
  principal_amount numeric(12,2),
  date date not null,
  created_at timestamptz not null,
  description text not null default '',
  notes text,
  source_id text not null,
  destination_id text,
  category_id text,
  tag text,
  tax_year integer,
  mode text,
  currency text not null default 'CAD',
  status text not null default 'posted',
  linked_vehicle_id text,
  linked_property_id text,
  linked_liability_id text,
  odometer text
);

create table if not exists public.vehicles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  year text not null,
  make text not null,
  model text not null,
  vtype text not null,
  payment numeric(12,2) not null default 0,
  schedule text not null,
  source text,
  lease_start date,
  lease_end date,
  next_payment_date date,
  mileage_allowance numeric(12,2) not null default 0,
  excess_rate numeric(12,4) not null default 0,
  residual numeric(12,2) not null default 0,
  end_of_lease_option text,
  principal numeric(12,2) not null default 0,
  remaining numeric(12,2) not null default 0,
  interest_rate numeric(12,4) not null default 0,
  status text not null default 'Active'
);

create table if not exists public.house_loans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  principal numeric(12,2) not null default 0,
  remaining numeric(12,2) not null default 0,
  payment numeric(12,2) not null default 0,
  schedule text not null,
  source text,
  start_date date,
  end_date date,
  next_payment_date date,
  interest_rate numeric(12,4) not null default 0
);

create table if not exists public.property_taxes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_number text not null
);

create table if not exists public.property_tax_payments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null references public.property_taxes(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  date date not null,
  paid boolean not null default false,
  paid_date date,
  note text
);

create table if not exists public.fixed_payments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  schedule text not null,
  date date not null,
  end_date date,
  source text not null,
  category_id text,
  mode text,
  tag text
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_user_id on public.accounts(user_id);
create index if not exists idx_credit_cards_user_id on public.credit_cards(user_id);
create index if not exists idx_categories_user_id on public.categories(user_id);
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_date on public.transactions(user_id, date);
create index if not exists idx_vehicles_user_id on public.vehicles(user_id);
create index if not exists idx_house_loans_user_id on public.house_loans(user_id);
create index if not exists idx_property_taxes_user_id on public.property_taxes(user_id);
create index if not exists idx_property_tax_payments_user_id on public.property_tax_payments(user_id);
create index if not exists idx_fixed_payments_user_id on public.fixed_payments(user_id);
create index if not exists idx_business_profiles_user_id on public.business_profiles(user_id);

alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.vehicles enable row level security;
alter table public.house_loans enable row level security;
alter table public.property_taxes enable row level security;
alter table public.property_tax_payments enable row level security;
alter table public.fixed_payments enable row level security;
alter table public.business_profiles enable row level security;

create policy if not exists "accounts_own_rows" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "credit_cards_own_rows" on public.credit_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "categories_own_rows" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "transactions_own_rows" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "vehicles_own_rows" on public.vehicles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "house_loans_own_rows" on public.house_loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "property_taxes_own_rows" on public.property_taxes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "property_tax_payments_own_rows" on public.property_tax_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "fixed_payments_own_rows" on public.fixed_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "business_profiles_own_rows" on public.business_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
