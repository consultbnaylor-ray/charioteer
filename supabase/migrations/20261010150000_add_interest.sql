-- Add a custom interest without failing when the slug already exists.
--
-- Live grants: authenticated may INSERT and SELECT interests, and INSERT
-- profile_interests. A second insert of the same slug raises
-- interests_slug_key. This function reuses that row and attaches it to the
-- caller. It is additive: no existing column or policy changes.
--
-- security definer so the conflict path can read the existing row and write
-- the caller's link in one round trip. search_path is fixed. auth.uid() is
-- the only user id it will attach.

create or replace function public.add_interest(label text)
returns public.interests
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text;
  interest_slug text;
  row public.interests;
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;

  clean := regexp_replace(btrim(coalesce(label, '')), '\s+', ' ', 'g');
  if char_length(clean) < 2 then
    raise exception 'Give the interest a name.';
  end if;
  if char_length(clean) > 40 then
    raise exception 'Keep the interest to 40 characters.';
  end if;

  interest_slug := left(
    trim(both '-' from regexp_replace(lower(clean), '[^a-z0-9]+', '-', 'g')),
    40
  );
  if interest_slug is null or interest_slug = '' then
    raise exception 'Use letters or numbers.';
  end if;

  insert into public.interests (slug, label, created_by)
  values (interest_slug, clean, uid)
  on conflict (slug) do nothing;

  select * into row from public.interests where slug = interest_slug;
  if row.id is null then
    raise exception 'Could not add that.';
  end if;

  insert into public.profile_interests (user_id, interest_id)
  values (uid, row.id)
  on conflict do nothing;

  return row;
end;
$$;

revoke all on function public.add_interest(text) from public, anon, authenticated;
grant execute on function public.add_interest(text) to authenticated;
