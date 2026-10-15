-- Build 23. Additive. Not applied from this repo.
-- Accountability buddies are a personal invite. Community and the public
-- profile switches are not consulted. The tables are not readable by the
-- client. These functions are the only path.

create table public.buddy_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'revoked')),
  scope jsonb not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  check (owner_id <> buddy_id)
);

create unique index buddy_invites_live_pair
  on public.buddy_invites (owner_id, buddy_id)
  where status in ('pending', 'accepted');

create index buddy_invites_buddy_idx on public.buddy_invites (buddy_id, status);

create table public.buddy_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  code_hash text not null unique,
  scope jsonb not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index buddy_links_owner_idx on public.buddy_links (owner_id, created_at desc);

create table public.buddy_invite_push_log (
  invite_id uuid primary key references public.buddy_invites (id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.buddy_invites enable row level security;
alter table public.buddy_links enable row level security;
alter table public.buddy_invite_push_log enable row level security;

revoke all on table public.buddy_invites from public, anon, authenticated;
revoke all on table public.buddy_links from public, anon, authenticated;
revoke all on table public.buddy_invite_push_log from public, anon, authenticated;

create or replace function public.buddy_scope(input jsonb)
returns jsonb
language plpgsql
immutable
as $function$
declare
  keys text[] := array[
    'meals', 'calories', 'quality', 'goal', 'progress',
    'checkIns', 'gratitude', 'vision', 'healthPlan', 'healthData'
  ];
  key text;
  result jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(input) is distinct from 'object' then
    input := '{}'::jsonb;
  end if;
  foreach key in array keys loop
    result := result || jsonb_build_object(key, coalesce((input ->> key) = 'true', false));
  end loop;
  return result;
end;
$function$;

create or replace function public.buddy_is_adult(person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.profiles
    where id = person and age_confirmed_18 is true
  );
$function$;

create or replace function public.buddy_pair_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$function$;

create or replace function public.buddy_redact(input text)
returns text
language sql
immutable
as $function$
  select nullif(btrim(regexp_replace(regexp_replace(
    coalesce(input, ''),
    '\d+(\.\d+)?\s*(kcal|kg|g|cm|%|steps|bpm|hours?)',
    ' ',
    'gi'
  ), '(bmi|body fat|waist|lean mass)', ' ', 'gi')), '');
$function$;

create or replace function public.create_buddy_invite(buddy uuid, scope jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  chosen jsonb := public.buddy_scope(scope);
  existing_id uuid;
  existing_status text;
begin
  if uid is null or buddy is null or uid = buddy then
    raise exception 'You cannot invite this person.';
  end if;
  if not public.buddy_is_adult(uid) then
    raise exception 'Confirm you are 18 or over first.';
  end if;
  if not public.buddy_is_adult(buddy) or public.buddy_pair_blocked(uid, buddy) then
    raise exception 'You cannot invite this person.';
  end if;
  if not exists (select 1 from public.profiles where id = buddy) then
    raise exception 'You cannot invite this person.';
  end if;
  if chosen = public.buddy_scope('{}'::jsonb) then
    raise exception 'Choose at least one thing to share.';
  end if;
  select id, status into existing_id, existing_status
  from public.buddy_invites
  where owner_id = uid and buddy_id = buddy and status in ('pending', 'accepted')
  limit 1;
  if existing_status = 'accepted' then
    raise exception 'You already share with this person.';
  end if;
  if existing_status = 'pending' then
    update public.buddy_invites set scope = chosen where id = existing_id;
    return existing_id;
  end if;
  if (
    select count(*) from public.buddy_invites
    where owner_id = uid and created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'Too many invites today.';
  end if;
  insert into public.buddy_invites (owner_id, buddy_id, status, scope)
  values (uid, buddy, 'pending', chosen)
  returning id into existing_id;
  return existing_id;
end;
$function$;

create or replace function public.create_buddy_link(scope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  chosen jsonb := public.buddy_scope(scope);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw_token text;
  raw_code text;
  bytes bytea;
  index integer;
  link_id uuid;
  expires_at timestamptz := now() + interval '7 days';
begin
  if uid is null then
    raise exception 'You cannot invite this person.';
  end if;
  if not public.buddy_is_adult(uid) then
    raise exception 'Confirm you are 18 or over first.';
  end if;
  if chosen = public.buddy_scope('{}'::jsonb) then
    raise exception 'Choose at least one thing to share.';
  end if;
  if (
    select count(*) from public.buddy_links
    where owner_id = uid and created_at > now() - interval '1 day'
  ) >= 8 then
    raise exception 'Too many links today.';
  end if;
  raw_token := encode(extensions.gen_random_bytes(16), 'hex');
  bytes := extensions.gen_random_bytes(8);
  raw_code := '';
  for index in 0..7 loop
    raw_code := raw_code || substr(alphabet, (get_byte(bytes, index) % 32) + 1, 1);
  end loop;
  insert into public.buddy_links (owner_id, token_hash, code_hash, scope, expires_at)
  values (
    uid,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    encode(extensions.digest(raw_code, 'sha256'), 'hex'),
    chosen,
    expires_at
  )
  returning id into link_id;
  return jsonb_build_object(
    'id', link_id,
    'token', raw_token,
    'code', raw_code,
    'expiresAt', expires_at,
    'url', 'charioteer://buddy?token=' || raw_token
  );
end;
$function$;

create or replace function public.accept_buddy_invite(invite uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  row public.buddy_invites%rowtype;
begin
  if uid is null or invite is null then
    raise exception 'That invite is not available.';
  end if;
  select * into row from public.buddy_invites where id = invite and buddy_id = uid and status = 'pending';
  if row.id is null then
    raise exception 'That invite is not available.';
  end if;
  if not public.buddy_is_adult(uid) or not public.buddy_is_adult(row.owner_id) or public.buddy_pair_blocked(uid, row.owner_id) then
    raise exception 'That invite is not available.';
  end if;
  update public.buddy_invites
  set status = 'accepted', responded_at = now()
  where id = row.id;
  return row.id;
end;
$function$;

create or replace function public.decline_buddy_invite(invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null or invite is null then
    raise exception 'That invite is not available.';
  end if;
  update public.buddy_invites
  set status = 'declined', responded_at = now()
  where id = invite and buddy_id = uid and status = 'pending';
  if not found then
    raise exception 'That invite is not available.';
  end if;
end;
$function$;

create or replace function public.preview_buddy_link(secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  hashed text;
  cleaned text;
  link public.buddy_links%rowtype;
  person_name text;
begin
  if uid is null or secret is null or char_length(btrim(secret)) < 8 then
    raise exception 'That invite is not available.';
  end if;
  cleaned := btrim(secret);
  if char_length(cleaned) = 8 then
    cleaned := upper(cleaned);
  else
    cleaned := lower(cleaned);
  end if;
  hashed := encode(extensions.digest(cleaned, 'sha256'), 'hex');
  select * into link
  from public.buddy_links
  where (token_hash = hashed or code_hash = hashed)
    and used_at is null
    and revoked_at is null
    and expires_at > now();
  if link.id is null or link.owner_id = uid then
    raise exception 'That invite is not available.';
  end if;
  if not public.buddy_is_adult(uid) or not public.buddy_is_adult(link.owner_id) or public.buddy_pair_blocked(uid, link.owner_id) then
    raise exception 'That invite is not available.';
  end if;
  select coalesce(nullif(btrim(display_name), ''), 'Member') into person_name
  from public.profiles where id = link.owner_id;
  return jsonb_build_object('name', person_name, 'scope', public.buddy_scope(link.scope));
end;
$function$;

create or replace function public.accept_buddy_link(secret text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  hashed text;
  cleaned text;
  link public.buddy_links%rowtype;
  existing_id uuid;
  existing_status text;
begin
  if uid is null or secret is null or char_length(btrim(secret)) < 8 then
    raise exception 'That invite is not available.';
  end if;
  cleaned := btrim(secret);
  if char_length(cleaned) = 8 then
    cleaned := upper(cleaned);
  else
    cleaned := lower(cleaned);
  end if;
  hashed := encode(extensions.digest(cleaned, 'sha256'), 'hex');
  select * into link
  from public.buddy_links
  where (token_hash = hashed or code_hash = hashed)
    and used_at is null
    and revoked_at is null
    and expires_at > now();
  if link.id is null or link.owner_id = uid then
    raise exception 'That invite is not available.';
  end if;
  if not public.buddy_is_adult(uid) or not public.buddy_is_adult(link.owner_id) or public.buddy_pair_blocked(uid, link.owner_id) then
    raise exception 'That invite is not available.';
  end if;
  select id, status into existing_id, existing_status
  from public.buddy_invites
  where owner_id = link.owner_id and buddy_id = uid and status in ('pending', 'accepted')
  limit 1;
  if existing_status = 'accepted' then
    update public.buddy_links set used_at = now(), used_by = uid where id = link.id;
    return existing_id;
  end if;
  if existing_status = 'pending' then
    update public.buddy_invites
    set status = 'accepted', scope = link.scope, responded_at = now()
    where id = existing_id;
  else
    insert into public.buddy_invites (owner_id, buddy_id, status, scope, responded_at)
    values (link.owner_id, uid, 'accepted', link.scope, now())
    returning id into existing_id;
  end if;
  update public.buddy_links set used_at = now(), used_by = uid where id = link.id;
  return existing_id;
end;
$function$;

create or replace function public.revoke_buddy(invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null or invite is null then
    raise exception 'That invite is not available.';
  end if;
  update public.buddy_invites
  set status = 'revoked', revoked_at = now()
  where id = invite
    and status in ('pending', 'accepted')
    and (owner_id = uid or buddy_id = uid);
  if not found then
    raise exception 'That invite is not available.';
  end if;
end;
$function$;

create or replace function public.revoke_buddy_link(link uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  update public.buddy_links
  set revoked_at = now()
  where id = link and owner_id = uid and used_at is null and revoked_at is null;
  if not found then
    raise exception 'That invite is not available.';
  end if;
end;
$function$;

create or replace function public.update_buddy_scope(invite uuid, scope jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  chosen jsonb := public.buddy_scope(scope);
begin
  if chosen = public.buddy_scope('{}'::jsonb) then
    raise exception 'Choose at least one thing to share.';
  end if;
  update public.buddy_invites
  set scope = chosen
  where id = invite and owner_id = uid and status in ('pending', 'accepted');
  if not found then
    raise exception 'That invite is not available.';
  end if;
end;
$function$;

create or replace function public.list_buddies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('sharing', '[]'::jsonb, 'watching', '[]'::jsonb, 'links', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'sharing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'ownerId', invite.owner_id,
        'buddyId', invite.buddy_id,
        'status', invite.status,
        'scope', invite.scope,
        'createdAt', invite.created_at,
        'name', coalesce(nullif(btrim(person.display_name), ''), 'Member')
      ) order by invite.created_at desc)
      from public.buddy_invites invite
      join public.profiles person on person.id = invite.buddy_id
      where invite.owner_id = uid and invite.status in ('pending', 'accepted')
    ), '[]'::jsonb),
    'watching', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invite.id,
        'ownerId', invite.owner_id,
        'buddyId', invite.buddy_id,
        'status', invite.status,
        'scope', invite.scope,
        'createdAt', invite.created_at,
        'name', coalesce(nullif(btrim(person.display_name), ''), 'Member')
      ) order by invite.created_at desc)
      from public.buddy_invites invite
      join public.profiles person on person.id = invite.owner_id
      where invite.buddy_id = uid and invite.status in ('pending', 'accepted')
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', link.id,
        'expiresAt', link.expires_at,
        'scope', link.scope,
        'createdAt', link.created_at
      ) order by link.created_at desc)
      from public.buddy_links link
      where link.owner_id = uid
        and link.used_at is null
        and link.revoked_at is null
        and link.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.shared_buddy_data(owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  invite public.buddy_invites%rowtype;
  scope jsonb;
  person_name text;
  london date := (timezone('Europe/London', now()))::date;
  share_meals boolean;
  share_kcal boolean;
  share_quality boolean;
  share_goal boolean;
  share_progress boolean;
  share_checkins boolean;
  share_gratitude boolean;
  share_vision boolean;
  share_plan boolean;
  share_health boolean;
  meals jsonb;
  calories text;
  quality text;
  goal_line text;
  progress text;
  checkins text;
  gratitude jsonb;
  vision jsonb;
  plan jsonb;
  health jsonb;
  kcal numeric;
  protein numeric;
  unsaturated numeric;
  other_fat numeric;
  progress_days integer;
  cursor date;
  mood smallint;
  mood_days integer;
  goal_key text;
  headline text;
  focus jsonb := '[]'::jsonb;
  item jsonb;
  line text;
  done boolean;
  ticked integer := 0;
  total integer := 0;
  statement text;
begin
  if uid is null or owner is null or uid = owner then
    return null;
  end if;
  select * into invite
  from public.buddy_invites
  where owner_id = owner and buddy_id = uid and status = 'accepted' and revoked_at is null;
  if invite.id is null then
    return null;
  end if;
  if not public.buddy_is_adult(uid) or not public.buddy_is_adult(owner) or public.buddy_pair_blocked(uid, owner) then
    return null;
  end if;

  scope := public.buddy_scope(invite.scope);
  share_meals := coalesce((scope ->> 'meals')::boolean, false);
  share_kcal := coalesce((scope ->> 'calories')::boolean, false);
  share_quality := coalesce((scope ->> 'quality')::boolean, false);
  share_goal := coalesce((scope ->> 'goal')::boolean, false);
  share_progress := coalesce((scope ->> 'progress')::boolean, false);
  share_checkins := coalesce((scope ->> 'checkIns')::boolean, false);
  share_gratitude := coalesce((scope ->> 'gratitude')::boolean, false);
  share_vision := coalesce((scope ->> 'vision')::boolean, false);
  share_plan := coalesce((scope ->> 'healthPlan')::boolean, false);
  share_health := coalesce((scope ->> 'healthData')::boolean, false);

  select coalesce(nullif(btrim(display_name), ''), 'Member') into person_name
  from public.profiles where id = owner;

  if share_meals then
    select coalesce(jsonb_agg(jsonb_build_object('meal', meal_row.meal, 'detail', meal_row.detail) order by meal_row.created_at), '[]'::jsonb)
    into meals
    from (
      select
        f.meal,
        f.created_at,
        coalesce((
          select string_agg(item ->> 'name', ', ' order by listed.ord)
          from jsonb_array_elements(case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end)
            with ordinality as listed(item, ord)
          where coalesce(item ->> 'name', '') <> ''
        ), 'Meal') as detail
      from public.food_logs f
      where f.user_id = owner and f.eaten_on = london
    ) meal_row;
  end if;

  if share_kcal or share_quality then
    select
      coalesce(sum(nullif(item ->> 'kcal', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'proteinG', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'unsaturatedG', '')::numeric), 0),
      coalesce(sum(nullif(item ->> 'saturatedG', '')::numeric), 0) + coalesce(sum(nullif(item ->> 'transG', '')::numeric), 0)
    into kcal, protein, unsaturated, other_fat
    from public.food_logs f
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
    ) as item
    where f.user_id = owner and f.eaten_on = london;
  end if;

  if share_kcal then
    if coalesce(kcal, 0) = 0 and coalesce(protein, 0) = 0 then
      calories := 'No calories or macros logged today.';
    else
      calories := round(coalesce(kcal, 0))::text || ' kcal, ' || round(coalesce(protein, 0))::text || ' g protein';
    end if;
  end if;

  if share_quality then
    if coalesce(unsaturated, 0) + coalesce(other_fat, 0) = 0 then
      quality := 'No fat logged today.';
    else
      quality := 'Unsaturated fat ' || round(unsaturated)::text || ' g. Other fat ' || round(other_fat)::text || ' g.';
    end if;
  end if;

  if share_goal then
    select goal into goal_key from public.nutrition_settings where user_id = owner;
    goal_line := case goal_key
      when 'lose_weight' then 'Lose Weight'
      when 'lose_fat_build_muscle' then 'Lose Fat & Build Muscle'
      when 'maintain' then 'Maintain Weight'
      when 'increase' then 'Increase Weight'
      else 'Nutrition goal'
    end;
  end if;

  if share_progress then
    if exists (select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = london) then
      cursor := london;
    elsif exists (select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = london - 1) then
      cursor := london - 1;
    else
      progress_days := 0;
    end if;
    if progress_days is null then
      progress_days := 0;
      while progress_days < 366 and exists (
        select 1 from public.food_logs f where f.user_id = owner and f.eaten_on = cursor
      ) loop
        progress_days := progress_days + 1;
        cursor := cursor - 1;
      end loop;
    end if;
    progress := 'Meals logged ' || progress_days::text || ' days in a row.';
  end if;

  if share_checkins then
    select c.mood into mood
    from public.check_ins c
    where c.user_id = owner
    order by c.created_at desc
    limit 1;
    if mood is null then
      checkins := 'No check-in yet.';
    else
      if exists (
        select 1 from public.check_ins c
        where c.user_id = owner and (timezone('Europe/London', c.created_at))::date = london
      ) then
        cursor := london;
      else
        cursor := london - 1;
      end if;
      mood_days := 0;
      while mood_days < 366 and exists (
        select 1 from public.check_ins c
        where c.user_id = owner and (timezone('Europe/London', c.created_at))::date = cursor
      ) loop
        mood_days := mood_days + 1;
        cursor := cursor - 1;
      end loop;
      checkins := 'Mood ' || mood::text || '. Checked in ' || mood_days::text || ' days in a row.';
    end if;
  end if;

  if share_gratitude then
    select coalesce(jsonb_agg(entry.body), '[]'::jsonb) into gratitude
    from (
      select g.body
      from public.gratitude_entries g
      where g.user_id = owner
      order by g.entry_date desc, g.created_at desc
      limit 12
    ) entry;
  end if;

  if share_vision then
    select vision_statement into statement from public.profiles where id = owner;
    select coalesce(jsonb_agg(lines.caption order by lines.ord), '[]'::jsonb) into vision
    from (
      select caption, ord
      from (
        select nullif(btrim(statement), '') as caption, 0 as ord
        union all
        select nullif(btrim(v.caption), ''), v.position + 1
        from public.vision_board_items v
        where v.user_id = owner
      ) trimmed
      where caption is not null
      order by ord
      limit 12
    ) lines;
  end if;

  if share_plan then
    select goal into goal_key from public.nutrition_settings where user_id = owner;
    headline := case goal_key
      when 'lose_weight' then 'Lose Weight'
      when 'lose_fat_build_muscle' then 'Lose Fat & Build Muscle'
      when 'maintain' then 'Maintain Weight'
      when 'increase' then 'Increase Weight'
      else 'Health plan'
    end;
    for item in
      select value from public.health_plans p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.focus) = 'array' then p.focus else '[]'::jsonb end)
      where p.user_id = owner
    loop
      line := public.buddy_redact(item ->> 'text');
      if line is null then
        continue;
      end if;
      done := coalesce((item ->> 'done')::boolean, false);
      focus := focus || jsonb_build_array(jsonb_build_object('text', line, 'done', done));
      total := total + 1;
      if done then
        ticked := ticked + 1;
      end if;
    end loop;
    if exists (select 1 from public.health_plans where user_id = owner) then
      plan := jsonb_build_object('headline', headline, 'focus', focus, 'ticked', ticked, 'total', total);
    end if;
  end if;

  if share_health then
    select jsonb_build_object(
      'bodyFatPct', comp.body_fat_pct,
      'leanMassKg', comp.lean_mass_kg,
      'waistCm', comp.waist_cm,
      'samples', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', sample.kind,
          'value', sample.value,
          'recordedOn', sample.recorded_on
        ))
        from (
          select h.kind, h.value, h.recorded_on
          from public.health_samples h
          where h.user_id = owner
            and h.recorded_on >= london - 13
            and h.kind in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg')
          order by h.recorded_on desc
          limit 80
        ) sample
      ), '[]'::jsonb)
    )
    into health
    from (
      select c.body_fat_pct, c.lean_mass_kg, c.waist_cm
      from public.body_composition c
      where c.user_id = owner
      order by c.recorded_on desc, c.created_at desc
      limit 1
    ) comp;
    if health is null then
      health := jsonb_build_object(
        'bodyFatPct', null,
        'leanMassKg', null,
        'waistCm', null,
        'samples', coalesce((
          select jsonb_agg(jsonb_build_object(
            'kind', sample.kind,
            'value', sample.value,
            'recordedOn', sample.recorded_on
          ))
          from (
            select h.kind, h.value, h.recorded_on
            from public.health_samples h
            where h.user_id = owner
              and h.recorded_on >= london - 13
              and h.kind in ('steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg')
            order by h.recorded_on desc
            limit 80
          ) sample
        ), '[]'::jsonb)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ownerId', owner,
    'displayName', person_name,
    'scope', scope,
    'meals', meals,
    'calories', calories,
    'quality', quality,
    'goal', goal_line,
    'progress', progress,
    'checkIns', checkins,
    'gratitude', gratitude,
    'vision', vision,
    'healthPlan', plan,
    'healthData', health
  );
end;
$function$;

revoke all on function public.buddy_scope(jsonb) from public, anon, authenticated;
revoke all on function public.buddy_is_adult(uuid) from public, anon, authenticated;
revoke all on function public.buddy_pair_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.buddy_redact(text) from public, anon, authenticated;

revoke all on function public.create_buddy_invite(uuid, jsonb) from public, anon;
revoke all on function public.create_buddy_link(jsonb) from public, anon;
revoke all on function public.accept_buddy_invite(uuid) from public, anon;
revoke all on function public.decline_buddy_invite(uuid) from public, anon;
revoke all on function public.preview_buddy_link(text) from public, anon;
revoke all on function public.accept_buddy_link(text) from public, anon;
revoke all on function public.revoke_buddy(uuid) from public, anon;
revoke all on function public.revoke_buddy_link(uuid) from public, anon;
revoke all on function public.update_buddy_scope(uuid, jsonb) from public, anon;
revoke all on function public.list_buddies() from public, anon;
revoke all on function public.shared_buddy_data(uuid) from public, anon;

grant execute on function public.create_buddy_invite(uuid, jsonb) to authenticated;
grant execute on function public.create_buddy_link(jsonb) to authenticated;
grant execute on function public.accept_buddy_invite(uuid) to authenticated;
grant execute on function public.decline_buddy_invite(uuid) to authenticated;
grant execute on function public.preview_buddy_link(text) to authenticated;
grant execute on function public.accept_buddy_link(text) to authenticated;
grant execute on function public.revoke_buddy(uuid) to authenticated;
grant execute on function public.revoke_buddy_link(uuid) to authenticated;
grant execute on function public.update_buddy_scope(uuid, jsonb) to authenticated;
grant execute on function public.list_buddies() to authenticated;
grant execute on function public.shared_buddy_data(uuid) to authenticated;

comment on table public.buddy_invites is
  'Personal accountability share. Independent of Community and public profile switches.';
comment on table public.buddy_links is
  'Single-use invite links. Only hashes of the token and the short code are stored.';
