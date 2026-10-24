-- Replace the signed-in user's reasons in one transaction.
--
-- The app used to delete, then insert, as two requests. A second save can
-- insert again while the first rows are still there, so each reason appears
-- twice. This function deletes the caller's rows and inserts the cleaned
-- list before it returns. It trims blanks and keeps the first of each
-- case-insensitive reason. It locks the profile row so two saves cannot
-- interleave. It does not add a unique index: rows that are already
-- repeated stay until the next call, which removes them in the delete.

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
  ) as picked;
end;
$$;

revoke all on function public.set_reasons(text[]) from public, anon, authenticated;
grant execute on function public.set_reasons(text[]) to authenticated;
