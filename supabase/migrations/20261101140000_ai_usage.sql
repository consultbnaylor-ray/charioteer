-- Not applied from this repo. Ben reviews this file before it runs.
-- Per-person AI usage. The phone can read its own rows. Only the
-- security-definer function increments them, and only the service role can call it.
-- A day is a Europe/London date. The month total is the sum of those days.

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (user_id, day, kind),
  check (kind in ('coach', 'meal', 'plan')),
  check (count >= 0)
);

alter table public.ai_usage enable row level security;

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.ai_usage from public, anon, authenticated;
grant all on table public.ai_usage to service_role;
grant select on table public.ai_usage to authenticated;

comment on table public.ai_usage is
  'Daily AI usage for the signed-in person. Select own rows only. Service role increments after the allowance check.';

create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_kind text,
  p_day date,
  p_month_start date,
  p_day_limit integer,
  p_month_limit integer
)
returns table (allowed boolean, day_count integer, month_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_day integer;
  current_month integer;
begin
  if p_kind not in ('coach', 'meal', 'plan') then
    raise exception 'Unknown usage kind.';
  end if;
  if p_day_limit < 1 or p_month_limit < 1 then
    raise exception 'Usage limit is not set.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_kind, 0));

  insert into public.ai_usage (user_id, day, kind, count)
  values (p_user_id, p_day, p_kind, 0)
  on conflict (user_id, day, kind) do nothing;

  select count into current_day
  from public.ai_usage
  where user_id = p_user_id and kind = p_kind and day = p_day;

  select coalesce(sum(count), 0) into current_month
  from public.ai_usage
  where user_id = p_user_id
    and kind = p_kind
    and day >= p_month_start
    and day < (p_month_start + interval '1 month')::date;

  if current_day >= p_day_limit or current_month >= p_month_limit then
    allowed := false;
    day_count := current_day;
    month_count := current_month;
    return next;
  end if;

  update public.ai_usage
  set count = count + 1
  where user_id = p_user_id and kind = p_kind and day = p_day
  returning count into current_day;

  allowed := true;
  day_count := current_day;
  month_count := current_month + 1;
  return next;
end;
$$;

revoke all on function public.increment_ai_usage(uuid, text, date, date, integer, integer) from public, anon, authenticated;
grant execute on function public.increment_ai_usage(uuid, text, date, date, integer, integer) to service_role;
