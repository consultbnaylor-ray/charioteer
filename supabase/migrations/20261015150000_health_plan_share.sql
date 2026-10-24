-- Build 23. Additive. Not applied from this repo.
-- Shares the Health Plan headline, this week's focus, and the tick count.
-- The health_plans row stays owner-only. This function is the only viewer path.

create or replace function public.shared_health_plan(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  owner public.profiles%rowtype;
  settings jsonb;
  plan_focus jsonb;
  goal text;
  headline text;
  focus jsonb := '[]'::jsonb;
  item jsonb;
  line text;
  done boolean;
  ticked integer := 0;
  total integer := 0;
begin
  if uid is null or target is null then
    return null;
  end if;

  select * into owner from public.profiles where id = target;
  if not found or owner.community_visible is not true or owner.age_confirmed_18 is not true then
    return null;
  end if;

  if uid is distinct from target and not public.viewer_in_community() then
    return null;
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = uid and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = uid)
  ) then
    return null;
  end if;

  select s.settings into settings from public.profile_sharing s where s.user_id = target;
  if coalesce((settings->>'healthPlan')::boolean, false) is not true then
    return null;
  end if;

  select hp.focus into plan_focus from public.health_plans hp where hp.user_id = target;
  if plan_focus is null or jsonb_typeof(plan_focus) is distinct from 'array' then
    return null;
  end if;

  select ns.goal into goal from public.nutrition_settings ns where ns.user_id = target;
  headline := case goal
    when 'lose_weight' then 'Lose Weight'
    when 'lose_fat_build_muscle' then 'Lose Fat & Build Muscle'
    when 'maintain' then 'Maintain Weight'
    when 'increase' then 'Increase Weight'
    else 'Health plan'
  end;

  for item in select value from jsonb_array_elements(plan_focus)
  loop
    line := coalesce(item->>'text', '');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*(kcal|kg|g|cm|steps|bpm|hours?)\M', '', 'gi');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*%', '', 'g');
    line := regexp_replace(line, '\m(bmi|body fat|waist|lean mass)\M[[:space:]]*\d[\d,.]*', '', 'gi');
    line := regexp_replace(line, '\m\d[\d,.]*[[:space:]]*(bmi|body fat|waist|lean mass)\M', '', 'gi');
    line := regexp_replace(line, '[[:space:]]+', ' ', 'g');
    line := btrim(regexp_replace(line, '[[:space:]]+([,.;:])', '\1', 'g'));
    if line = '' or line !~ '[[:alnum:]]' then
      continue;
    end if;
    done := coalesce((item->>'done')::boolean, false);
    focus := focus || jsonb_build_array(jsonb_build_object('text', line, 'done', done));
    total := total + 1;
    if done then
      ticked := ticked + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'headline', headline,
    'focus', focus,
    'ticked', ticked,
    'total', total
  );
end;
$function$;

revoke all on function public.shared_health_plan(uuid) from public, anon;
grant execute on function public.shared_health_plan(uuid) to authenticated;

comment on function public.shared_health_plan(uuid) is
  'Headline, focus lines, and tick count for a community member. Omits targets, habits, fitness, wellbeing, limits, weight, and body figures.';
