-- Build 15 hotfix. Replaces save_check_in only. No table or data changes.
--
-- The gratitude upsert used `on conflict (check_in_id)`. Inside this function
-- check_in_id is also a parameter name, so PL/pgSQL raised 42702
-- "column reference check_in_id is ambiguous" whenever a check-in carried a
-- gratitude line, and the whole save rolled back. The conflict target now
-- names the unique constraint. Same signature and parameter names, so every
-- app build that calls save_check_in keeps working.

create or replace function public.save_check_in(
  check_in_id uuid,
  mood smallint,
  sleep_hours numeric,
  craving smallint,
  note text,
  gratitude text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stamp timestamptz;
  clean text := '';
  line text;
  lines text[] := array[]::text[];
  note_text text := btrim(coalesce(note, ''));
begin
  if uid is null then
    raise exception 'Sign in first.';
  end if;

  perform 1 from public.profiles where id = uid for update;
  if not found then
    raise exception 'Sign in first.';
  end if;

  if check_in_id is null then
    raise exception 'Could not save.';
  end if;
  if mood is null or mood < 1 or mood > 10 then
    raise exception 'Choose a mood from 1 to 10.';
  end if;
  if sleep_hours is null or sleep_hours < 0 or sleep_hours > 24 then
    raise exception 'Sleep needs to be between 0 and 24 hours.';
  end if;
  if craving is null or craving < 0 or craving > 10 then
    raise exception 'Choose a craving from 0 to 10.';
  end if;
  if char_length(note_text) > 2000 then
    raise exception 'Keep the note shorter.';
  end if;

  clean := replace(btrim(coalesce(gratitude, '')), E'\r', '');
  if clean <> '' then
    foreach line in array regexp_split_to_array(clean, E'\n') loop
      line := btrim(line);
      if line = '' then
        continue;
      end if;
      if char_length(line) > 200 then
        raise exception 'Keep each line to 200 characters.';
      end if;
      lines := array_append(lines, line);
    end loop;
    if cardinality(lines) > 3 then
      raise exception 'Keep it to three short lines.';
    end if;
    clean := case when cardinality(lines) = 0 then '' else array_to_string(lines, E'\n') end;
  end if;

  insert into public.check_ins (id, user_id, mood, mood_10, sleep_hours, craving, note)
  values (check_in_id, uid, null, mood, sleep_hours, craving, note_text)
  on conflict (id) do update
    set mood_10 = excluded.mood_10,
        sleep_hours = excluded.sleep_hours,
        craving = excluded.craving,
        note = excluded.note
    where public.check_ins.user_id = uid;

  select c.created_at into stamp
  from public.check_ins c
  where c.id = check_in_id and c.user_id = uid;

  if stamp is null then
    raise exception 'Could not save.';
  end if;

  if clean = '' then
    delete from public.gratitude_entries
    where gratitude_entries.check_in_id = save_check_in.check_in_id
      and gratitude_entries.user_id = uid;
    return;
  end if;

  insert into public.gratitude_entries (
    user_id,
    body,
    category,
    is_favourite,
    entry_date,
    created_at,
    check_in_id
  ) values (
    uid,
    clean,
    null,
    false,
    (stamp at time zone 'Europe/London')::date,
    stamp,
    check_in_id
  )
  on conflict on constraint gratitude_entries_check_in_id_key do update
    set body = excluded.body,
        entry_date = excluded.entry_date,
        updated_at = now()
    where public.gratitude_entries.user_id = uid;
end;
$$;

revoke all on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) from public, anon, authenticated;
grant execute on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) to authenticated;
