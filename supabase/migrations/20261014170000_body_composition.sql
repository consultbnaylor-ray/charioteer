-- Body composition. Owner only. Existing rows are not deleted.
-- Other people see a short composition line only when share_progress is on,
-- through shared_nutrition. The table itself is never readable by anyone else.

create table public.body_composition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recorded_on date not null,
  body_fat_pct numeric check (body_fat_pct is null or (body_fat_pct >= 2 and body_fat_pct <= 70)),
  lean_mass_kg numeric check (lean_mass_kg is null or (lean_mass_kg >= 20 and lean_mass_kg <= 200)),
  waist_cm numeric check (waist_cm is null or (waist_cm >= 40 and waist_cm <= 200)),
  source text not null check (source in ('healthkit', 'smart_scale', 'gym_scan', 'dexa', 'other')),
  created_at timestamptz not null default now(),
  check (body_fat_pct is not null or lean_mass_kg is not null or waist_cm is not null),
  unique (user_id, recorded_on, source)
);

create index body_composition_user_day on public.body_composition (user_id, recorded_on desc, created_at desc);

alter table public.body_composition enable row level security;

create policy body_composition_all on public.body_composition
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.body_composition from public, anon, authenticated;
grant select, insert, update, delete on public.body_composition to authenticated;

alter table public.nutrition_settings
  add column if not exists build text
    check (build is null or build in ('muscular', 'average', 'slim'));

create or replace function public.shared_nutrition(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner public.profiles%rowtype;
  settings public.nutrition_settings%rowtype;
  has_settings boolean := false;
  share_meals boolean := false;
  share_kcal boolean := false;
  share_qual boolean := false;
  share_prog boolean := false;
  share_wagon boolean := false;
  share_the_goal boolean := false;
  hide boolean := false;
  london date := (timezone('Europe/London', now()))::date;
  cursor date := london;
  meals jsonb := '[]'::jsonb;
  kcal numeric := 0;
  protein numeric := 0;
  carbs numeric := 0;
  sugar numeric := 0;
  fibre numeric := 0;
  unsaturated numeric := 0;
  other_fat numeric := 0;
  progress_days integer := null;
  weight_days integer := 0;
  earlier_kg numeric := null;
  latest_kg numeric := null;
  direction text := 'unknown';
  bmi_low boolean := false;
  fat_pct numeric := null;
  lean_kg numeric := null;
  waist numeric := null;
  composition text := null;
begin
  if uid is null or target is null then
    return null;
  end if;

  select * into owner from public.profiles where id = target;
  if not found or owner.community_visible is not true or owner.age_confirmed_18 is not true then
    return null;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = uid)
  ) then
    return null;
  end if;

  select * into settings from public.nutrition_settings where user_id = target;
  has_settings := found;
  if has_settings then
    share_meals := settings.share_food_diary;
    share_kcal := settings.share_calories;
    share_qual := settings.share_quality;
    share_prog := settings.share_progress;
    share_wagon := settings.wagon_on and settings.wagon_visible;
    share_the_goal := settings.share_goal and settings.goal is not null;
    hide := settings.hide_calories;
  end if;

  if share_meals then
    select coalesce(jsonb_agg(meal_row.payload order by meal_row.created_at), '[]'::jsonb)
      into meals
    from (
      select f.created_at,
        jsonb_build_object(
          'meal', f.meal,
          'note', f.note,
          'estimated', f.estimated,
          'names', coalesce((
            select string_agg(item->>'name', ', ' order by listed.ord)
            from jsonb_array_elements(
              case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
            ) with ordinality as listed(item, ord)
            where coalesce(item->>'name', '') <> ''
          ), '')
        ) as payload
      from public.food_logs f
      where f.user_id = target
        and f.eaten_on = london
    ) meal_row;
  end if;

  if share_kcal or share_qual or share_the_goal then
    select
      coalesce(sum(nullif(item->>'kcal', '')::numeric), 0),
      coalesce(sum(nullif(item->>'proteinG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'carbsG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'sugarG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'fibreG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'unsaturatedG', '')::numeric), 0),
      coalesce(sum(nullif(item->>'saturatedG', '')::numeric), 0) + coalesce(sum(nullif(item->>'transG', '')::numeric), 0)
      into kcal, protein, carbs, sugar, fibre, unsaturated, other_fat
    from public.food_logs f
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(f.items) = 'array' then f.items else '[]'::jsonb end
    ) as item
    where f.user_id = target
      and f.eaten_on = london;
  end if;

  if share_prog then
    if exists (
      select 1 from public.food_logs f where f.user_id = target and f.eaten_on = london
    ) then
      cursor := london;
    elsif exists (
      select 1 from public.food_logs f where f.user_id = target and f.eaten_on = london - 1
    ) then
      cursor := london - 1;
    else
      progress_days := 0;
    end if;
    if progress_days is null then
      progress_days := 0;
      while progress_days < 366 and exists (
        select 1 from public.food_logs f where f.user_id = target and f.eaten_on = cursor
      ) loop
        progress_days := progress_days + 1;
        cursor := cursor - 1;
      end loop;
    end if;
  end if;

  if share_the_goal then
    select count(*) into weight_days
    from (
      select h.recorded_on
      from public.health_samples h
      where h.user_id = target and h.kind = 'weight_kg'
      group by h.recorded_on
    ) days;

    select h.value into latest_kg
    from public.health_samples h
    where h.user_id = target and h.kind = 'weight_kg'
    order by h.recorded_on desc
    limit 1;

    if weight_days >= 2 then
      select h.value into earlier_kg
      from public.health_samples h
      where h.user_id = target and h.kind = 'weight_kg'
      order by h.recorded_on asc
      limit 1;

      if latest_kg - earlier_kg <= -0.3 then
        direction := 'down';
      elsif latest_kg - earlier_kg >= 0.3 then
        direction := 'up';
      else
        direction := 'steady';
      end if;
    end if;

    if latest_kg is not null and owner.height_cm is not null and owner.height_cm > 0
       and settings.goal in ('lose_weight', 'lose_fat_build_muscle')
       and (latest_kg / power(owner.height_cm / 100.0, 2)) < 18.5 then
      bmi_low := true;
    end if;
  end if;


  if share_prog then
    select b.body_fat_pct into fat_pct
    from public.body_composition b
    where b.user_id = target and b.body_fat_pct is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    select b.lean_mass_kg into lean_kg
    from public.body_composition b
    where b.user_id = target and b.lean_mass_kg is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    select b.waist_cm into waist
    from public.body_composition b
    where b.user_id = target and b.waist_cm is not null
    order by b.recorded_on desc, b.created_at desc
    limit 1;

    if fat_pct is not null then
      composition := 'Body fat ' || regexp_replace(round(fat_pct, 1)::text, '\\.0$', '') || '%.';
    elsif waist is not null and owner.height_cm is not null and owner.height_cm > 0 then
      if (waist / owner.height_cm) < 0.5 then
        composition := 'Waist is less than half their height.';
      else
        composition := 'Waist-to-height is 0.5 or more.';
      end if;
    elsif lean_kg is not null then
      composition := 'Lean body mass is recorded.';
    end if;
  end if;

  return jsonb_build_object(
    'mealsShared', share_meals,
    'meals', case when share_meals then meals else '[]'::jsonb end,
    'calories', case when share_kcal then jsonb_build_object(
      'kcal', case when hide then null else round(kcal) end,
      'proteinG', round(protein, 1),
      'carbsG', round(carbs, 1),
      'sugarG', round(sugar, 1),
      'fibreG', round(fibre, 1)
    ) else null end,
    'quality', case when share_qual then jsonb_build_object(
      'unsaturatedG', round(unsaturated, 1),
      'otherG', round(other_fat, 1)
    ) else null end,
    'progressDays', progress_days,
    'composition', composition,
    'wagonOn', share_wagon,
    'wagonNote', case when share_wagon and has_settings then settings.wagon_note else '' end,
    'goal', case when share_the_goal then jsonb_build_object(
      'id', settings.goal,
      'proteinG', round(protein, 1),
      'proteinTargetG', settings.protein_target_g,
      'direction', direction,
      'hideCalories', hide,
      'bmiLow', bmi_low
    ) else null end
  );
end;
$$;

revoke all on function public.shared_nutrition(uuid) from public, anon;
grant execute on function public.shared_nutrition(uuid) to authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'reasons', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order), '[]'::jsonb) from public.reasons r where r.user_id = uid),
    'check_ins', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.check_ins c where c.user_id = uid),
    'relapses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.relapses r where r.user_id = uid),
    'health_samples', (select coalesce(jsonb_agg(to_jsonb(h) order by h.recorded_on), '[]'::jsonb) from public.health_samples h where h.user_id = uid),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.consents c where c.user_id = uid),
    'thumos_messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.thumos_messages m where m.user_id = uid),
    'interests', (
      select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.user_id = uid
    ),
    'connections', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.connections c
      where uid in (c.requester_id, c.addressee_id)
    ),
    'messages', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
      from public.direct_messages m
      join public.connections c on c.id = m.connection_id
      where uid in (c.requester_id, c.addressee_id)
    ),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reports r where r.reporter_id = uid),
    'progress_photos', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.month_index, p.taken_on), '[]'::jsonb)
      from public.progress_photos p
      where p.user_id = uid
    ),
    'gratitude_entries', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.entry_date, g.created_at), '[]'::jsonb)
      from public.gratitude_entries g
      where g.user_id = uid
    ),
    'gratitude_photos', (
      select coalesce(jsonb_agg(to_jsonb(gp) order by gp.created_at), '[]'::jsonb)
      from public.gratitude_photos gp
      where gp.user_id = uid
    ),
    'vision_board_items', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.position, v.created_at), '[]'::jsonb)
      from public.vision_board_items v
      where v.user_id = uid
    ),
    'user_quotes', (
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      from public.user_quotes q
      where q.user_id = uid
    ),
    'profile_photos', (
      select coalesce(jsonb_agg(to_jsonb(ph) order by ph.role, ph.position, ph.created_at), '[]'::jsonb)
      from public.profile_photos ph
      where ph.user_id = uid
    ),
    'profile_sharing', (
      select coalesce(to_jsonb(s), 'null'::jsonb)
      from public.profile_sharing s
      where s.user_id = uid
    ),
    'food_logs', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.eaten_on, f.created_at), '[]'::jsonb)
      from public.food_logs f
      where f.user_id = uid
    ),
    'nutrition_settings', (
      select coalesce(to_jsonb(n), 'null'::jsonb)
      from public.nutrition_settings n
      where n.user_id = uid
    ),
    'nutrition_days', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb)
      from public.nutrition_days d
      where d.user_id = uid
    ),
    'body_composition', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.recorded_on, b.created_at), '[]'::jsonb)
      from public.body_composition b
      where b.user_id = uid
    )
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
