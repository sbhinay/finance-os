-- FinanceOS snapshot history retention.
--
-- Every guarded save appends a full copy of the user's data to
-- app_snapshot_history. Without retention the table grows on every autosave.
--
-- Kept for each user:
--   1. The 20 most recent revisions.
--   2. The latest revision of each calendar day (America/Toronto) for the
--      last 30 days.
--   3. Pre-operation restore points (labels starting "Before ", created before
--      a JSON import, cloud restore, or Clear All) for the last 30 days.
-- Everything else is deleted. The live copy in app_snapshots is never touched.
--
-- Run once in the Supabase SQL Editor after 02_guarded_snapshots.sql. It
-- installs the pruning function and trigger, then prunes existing history.

create or replace function public.prune_app_snapshot_history(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with ranked as (
    select
      id,
      row_number() over (order by revision desc) as recent_rank,
      row_number() over (
        partition by (created_at at time zone 'America/Toronto')::date
        order by revision desc
      ) as day_rank,
      created_at >= now() - interval '30 days' as within_30_days,
      coalesce(label, '') like 'Before %' as is_restore_point
    from public.app_snapshot_history
    where user_id = p_user_id
  )
  delete from public.app_snapshot_history history
  using ranked
  where history.id = ranked.id
    and ranked.recent_rank > 20
    and not (ranked.within_30_days and ranked.day_rank = 1)
    and not (ranked.within_30_days and ranked.is_restore_point);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_app_snapshot_history(uuid) from public;
revoke all on function public.prune_app_snapshot_history(uuid) from authenticated;

create or replace function public.prune_app_snapshot_history_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_app_snapshot_history(new.user_id);
  return null;
end;
$$;

revoke all on function public.prune_app_snapshot_history_after_insert() from public;

drop trigger if exists app_snapshot_history_retention on public.app_snapshot_history;
create trigger app_snapshot_history_retention
  after insert on public.app_snapshot_history
  for each row
  execute function public.prune_app_snapshot_history_after_insert();

-- One-time cleanup of history that built up before retention existed.
select user_id, public.prune_app_snapshot_history(user_id) as deleted_revisions
from (select distinct user_id from public.app_snapshot_history) users;
