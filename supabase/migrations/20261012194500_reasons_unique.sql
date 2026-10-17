-- Build 16. Additive. Stops duplicate reasons at the database.
--
-- Ben's list held each reason twice, written 3 ms apart on 11 Oct at 09:56 BST
-- by the old client (delete, then insert) before set_reasons existed. Those
-- copies were removed by hand, keeping the earliest row. This makes a repeat
-- impossible whatever path writes reasons:
--   * one row per person per reason (trimmed, case-insensitive)
--   * set_reasons skips a clash instead of failing
--   * the app writes only through set_reasons, so direct inserts are revoked
-- Refuses to run if any duplicates are still present. No rows are deleted here.

do $g$
begin
  if exists (
    select 1 from public.reasons
    group by user_id, lower(btrim(body))
    having count(*) > 1
  ) then
    raise exception 'duplicate reasons exist; clean them up first. Refusing to delete user data.';
  end if;
end
$g$;

create unique index reasons_user_body_unique
  on public.reasons (user_id, lower(btrim(body)));

create or replace function public.set_reasons(bodies text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;

  perform 1 from public.profiles where id = uid for update;
  if not found then
    raise exception 'Sign in first.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(bodies, array[]::text[])) as listed(item)
    where char_length(btrim(coalesce(item, ''))) > 280
  ) then
    raise exception 'Keep each reason to 280 characters.';
  end if;

  delete from public.reasons where user_id = uid;

  insert into public.reasons (user_id, body, sort_order)
  select uid, picked.body, row_number() over (order by picked.ord) - 1
  from (
    select distinct on (lower(clean.body)) clean.body, clean.ord
    from (
      select btrim(item) as body, ordinality as ord
      from unnest(coalesce(bodies, array[]::text[])) with ordinality as listed(item, ordinality)
    ) as clean
    where clean.body <> ''
    order by lower(clean.body), clean.ord
  ) as picked
  on conflict (user_id, lower(btrim(body))) do nothing;
end;
$$;

revoke all on function public.set_reasons(text[]) from public, anon;
grant execute on function public.set_reasons(text[]) to authenticated;

revoke insert on public.reasons from authenticated;
