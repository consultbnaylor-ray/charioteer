-- Not applied from this repo. Ben reviews this file before it runs.
-- What each xAI call cost us, so a spend warning can fire before the balance runs out.
--
-- Stored per answered call: the function, the plan tier, the model, token counts and the cost.
-- No user id, no prompt, no reply, no photo. Nothing here is personal data, so account
-- deletion and export have nothing to remove or include.
-- Only the service role (the edge functions) can read or write. Row level security is on
-- with no policy, so the phone and anonymous callers see nothing.

create table public.ai_spend_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  fn text not null check (char_length(fn) between 1 and 40),
  tier text check (tier in ('standard', 'pro', 'max')),
  model text not null check (char_length(model) between 1 and 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  cost_source text not null check (cost_source in ('xai', 'estimated'))
);

create index ai_spend_log_created_at_idx on public.ai_spend_log (created_at);

alter table public.ai_spend_log enable row level security;
revoke all on table public.ai_spend_log from public, anon, authenticated;
grant all on table public.ai_spend_log to service_role;

comment on table public.ai_spend_log is
  'xAI cost per answered call. Function, tier, model, tokens and USD only. No user id or content. Service role only.';

-- One row per month and alert level, so each warning is sent once.
create table public.ai_spend_alerts (
  month date not null,
  threshold integer not null check (threshold between 1 and 100),
  spend_usd numeric(12, 2) not null,
  budget_usd numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  primary key (month, threshold)
);

alter table public.ai_spend_alerts enable row level security;
revoke all on table public.ai_spend_alerts from public, anon, authenticated;
grant all on table public.ai_spend_alerts to service_role;

comment on table public.ai_spend_alerts is
  'Which monthly AI budget warnings have been sent. Amounts only. Service role only.';

-- Month-to-date spend. A month is the UTC calendar month, which is how xAI bills.
create or replace function public.ai_spend_month(p_month_start date)
returns table (cost_usd numeric, calls bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(l.cost_usd), 0)::numeric, count(*)::bigint
  from public.ai_spend_log l
  where l.created_at >= (p_month_start::timestamp at time zone 'UTC')
    and l.created_at < ((p_month_start + interval '1 month')::timestamp at time zone 'UTC');
$$;

revoke all on function public.ai_spend_month(date) from public, anon, authenticated;
grant execute on function public.ai_spend_month(date) to service_role;

-- Rows older than 400 days are not needed. Runs daily when pg_cron is installed.
create or replace function public.purge_ai_spend_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ai_spend_log where created_at < now() - interval '400 days';
  delete from public.ai_spend_alerts where month < (now() - interval '400 days')::date;
end;
$$;

revoke all on function public.purge_ai_spend_log() from public, anon, authenticated;
grant execute on function public.purge_ai_spend_log() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge-ai-spend-log') then
      perform cron.schedule(
        'purge-ai-spend-log',
        '25 3 * * *',
        'select public.purge_ai_spend_log()'
      );
    end if;
  end if;
end $$;
