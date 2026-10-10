-- Where someone is with alcohol, without rewriting existing rows into a false start.
--
-- New accounts default to exploring. Anyone who already has a sober date is
-- backfilled to stopped. Public default privileges are revoked, so the new
-- columns are granted explicitly. This is column UPDATE only.

alter table public.profiles
  add column stage text not null default 'exploring'
    check (stage in ('stopped', 'trying_to_stop', 'cutting_down', 'exploring')),
  add column planned_quit_at date,
  add column weekly_units_goal numeric(8, 2)
    check (weekly_units_goal is null or weekly_units_goal >= 0),
  add column drink_free_days_goal smallint
    check (drink_free_days_goal is null or drink_free_days_goal between 0 and 7),
  add column drink_free_on date[] not null default '{}';

update public.profiles
set stage = 'stopped'
where sobriety_started_at is not null
  and stage = 'exploring';

grant update (
  stage,
  planned_quit_at,
  weekly_units_goal,
  drink_free_days_goal,
  drink_free_on
) on public.profiles to authenticated;
