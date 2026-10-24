-- Build 45 DPIA. Not applied from this repo.
-- A report about an account that is later deleted is kept for moderation,
-- then removed 12 months after that deletion. Reports the deleted person
-- filed are already removed with the account.

alter table public.reports add column if not exists subject_deleted_at timestamptz;

create index if not exists reports_subject_deleted_idx on public.reports (subject_deleted_at);

create or replace function public.stamp_deleted_report_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reports
    set subject_deleted_at = now()
    where reported_user_id = old.id
      and subject_deleted_at is null;
  return old;
end;
$$;

drop trigger if exists reports_stamp_deleted_subject on public.profiles;
create trigger reports_stamp_deleted_subject
  before delete on public.profiles
  for each row execute function public.stamp_deleted_report_subject();

revoke all on function public.stamp_deleted_report_subject() from public, anon, authenticated;

create or replace function public.purge_deleted_account_reports()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reports
  where (
    subject_deleted_at is not null
    and subject_deleted_at < now() - interval '12 months'
  ) or (
    subject_deleted_at is null
    and reported_user_id is null
    and created_at < now() - interval '12 months'
  );
end;
$$;

revoke all on function public.purge_deleted_account_reports() from public, anon, authenticated;
grant execute on function public.purge_deleted_account_reports() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge-deleted-account-reports') then
      perform cron.schedule(
        'purge-deleted-account-reports',
        '20 3 * * *',
        'select public.purge_deleted_account_reports()'
      );
    end if;
  end if;
end $$;
