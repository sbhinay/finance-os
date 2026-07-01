-- Guarded manual cloud snapshots with append-only restore history.

create extension if not exists pgcrypto;

create table if not exists public.app_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  payload_hash text not null,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_snapshots add column if not exists revision bigint;
alter table public.app_snapshots add column if not exists payload_hash text;
alter table public.app_snapshots add column if not exists device_id text;
alter table public.app_snapshots add column if not exists created_at timestamptz;
update public.app_snapshots
  set revision = coalesce(revision, 1),
      payload_hash = coalesce(payload_hash, md5(payload::text)),
      created_at = coalesce(created_at, updated_at, now());
alter table public.app_snapshots alter column revision set default 1;
alter table public.app_snapshots alter column revision set not null;
alter table public.app_snapshots alter column payload_hash set not null;
alter table public.app_snapshots alter column created_at set default now();
alter table public.app_snapshots alter column created_at set not null;

create table if not exists public.app_snapshot_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  payload_hash text not null,
  device_id text,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, revision)
);

create index if not exists idx_app_snapshot_history_user_revision
  on public.app_snapshot_history(user_id, revision desc);

alter table public.app_snapshots enable row level security;
alter table public.app_snapshot_history enable row level security;

revoke insert, update, delete on public.app_snapshots from authenticated;
revoke insert, update, delete on public.app_snapshot_history from authenticated;
grant select on public.app_snapshots to authenticated;
grant select on public.app_snapshot_history to authenticated;

drop policy if exists "app_snapshots_own_rows" on public.app_snapshots;
create policy "app_snapshots_own_rows" on public.app_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists "app_snapshot_history_own_rows" on public.app_snapshot_history;
create policy "app_snapshot_history_own_rows" on public.app_snapshot_history
  for select using (auth.uid() = user_id);
drop policy if exists "app_snapshot_history_insert_own_rows" on public.app_snapshot_history;

create or replace function public.save_app_snapshot_guarded(
  p_payload jsonb,
  p_expected_revision bigint,
  p_payload_hash text,
  p_device_id text,
  p_label text default null
)
returns table (
  revision bigint,
  updated_at timestamptz,
  payload_hash text,
  device_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.app_snapshots%rowtype;
  v_revision bigint;
  v_updated_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if pg_column_size(p_payload) > 20971520 then
    raise exception 'snapshot_too_large' using errcode = '22001';
  end if;
  if length(coalesce(p_label, '')) > 120 then
    raise exception 'snapshot_label_too_long' using errcode = '22001';
  end if;

  select * into v_current
  from public.app_snapshots
  where user_id = v_user_id
  for update;

  if found then
    if p_expected_revision is null or p_expected_revision <> v_current.revision then
      raise exception 'snapshot_conflict' using errcode = '40001';
    end if;
    v_revision := v_current.revision + 1;
    update public.app_snapshots
      set payload = p_payload,
          revision = v_revision,
          payload_hash = p_payload_hash,
          device_id = p_device_id,
          updated_at = v_updated_at
      where user_id = v_user_id;
  else
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'snapshot_conflict' using errcode = '40001';
    end if;
    v_revision := 1;
    insert into public.app_snapshots (
      user_id, payload, revision, payload_hash, device_id, created_at, updated_at
    ) values (
      v_user_id, p_payload, v_revision, p_payload_hash, p_device_id, v_updated_at, v_updated_at
    );
  end if;

  insert into public.app_snapshot_history (
    user_id, revision, payload, payload_hash, device_id, label, created_at
  ) values (
    v_user_id, v_revision, p_payload, p_payload_hash, p_device_id, p_label, v_updated_at
  );

  return query select v_revision, v_updated_at, p_payload_hash, p_device_id;
end;
$$;

revoke all on function public.save_app_snapshot_guarded(jsonb, bigint, text, text, text) from public;
grant execute on function public.save_app_snapshot_guarded(jsonb, bigint, text, text, text) to authenticated;
