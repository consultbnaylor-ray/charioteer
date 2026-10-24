-- Build 15. Additive. Not applied from this repo.
--
-- Mood is scored from 1 to 10 in mood_10. The original mood column stays,
-- with the 1-5 values testers already saved. Nothing is deleted.
-- Existing rows are copied once: mood_10 = mood * 2 (1→2, 2→4, 3→6, 4→8, 5→10).
-- New check-ins write mood_10 and leave mood null, so a new score is not
-- squeezed back into 1-5. Saving an old row again updates mood_10 only.
--
-- export_my_data already returns to_jsonb of each check-in, so the download
-- keeps mood and gains mood_10. Apply this with the app that sends 1 to 10.

alter table public.check_ins
  add column mood_10 smallint;

update public.check_ins
  set mood_10 = mood * 2
  where mood_10 is null
    and mood between 1 and 5;

alter table public.check_ins
  alter column mood_10 set not null;

alter table public.check_ins
  add constraint check_ins_mood_10_range check (mood_10 between 1 and 10);

alter table public.check_ins
  alter column mood drop not null;

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
  on conflict (check_in_id) do update
    set body = excluded.body,
        entry_date = excluded.entry_date,
        updated_at = now()
    where public.gratitude_entries.user_id = uid;
end;
$$;

revoke all on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) from public, anon, authenticated;
grant execute on function public.save_check_in(uuid, smallint, numeric, smallint, text, text) to authenticated;
