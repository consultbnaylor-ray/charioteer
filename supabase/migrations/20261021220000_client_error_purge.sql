-- Build 45 DPIA. Not applied from this repo.
-- Client error rows keep the step and the error type only, and they are
-- deleted after 90 days. The privacy-purge function calls purge_client_errors
-- when pg_cron is not installed.

create or replace function public.purge_client_errors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.client_errors
  where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.purge_client_errors() from public, anon, authenticated;
grant execute on function public.purge_client_errors() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge-client-errors') then
      perform cron.schedule(
        'purge-client-errors',
        '15 3 * * *',
        'select public.purge_client_errors()'
      );
    end if;
  end if;
end $$;
