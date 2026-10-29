-- Not applied. Do not run this from the app or from a deploy.
-- Adds the tables that were missing from export_my_data.
-- Saved routes are included without geometry, so a download does not carry coordinates.
-- buddy_photo_push_log is read only when that table exists.
-- Apply after the tables exist. outdoor_routes may still hold a line until 20261029120000 is applied; this download leaves that column out.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  photo_push jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if to_regclass('public.buddy_photo_push_log') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'photo_id', l.photo_id,
        'recipient_id', l.recipient_id,
        'sent_at', l.sent_at,
        'coalesced', l.coalesced
      ) order by l.sent_at), '[]'::jsonb)
      from public.buddy_photo_push_log l
      left join public.buddy_photos bp on bp.id = l.photo_id
      where l.recipient_id = $1 or bp.owner_id = $1
    $q$ into photo_push using uid;
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
    ),
    'health_plans', (
      select coalesce(to_jsonb(hp), 'null'::jsonb)
      from public.health_plans hp
      where hp.user_id = uid
    ),
    'training_schedules', (
      select coalesce(to_jsonb(ts), 'null'::jsonb)
      from public.training_schedules ts
      where ts.user_id = uid
    ),
    'garmin_connection', (
      select coalesce(jsonb_build_object(
        'garmin_user_id', g.garmin_user_id,
        'scopes', g.scopes,
        'permissions', g.permissions,
        'connected_at', g.connected_at,
        'revoked_at', g.revoked_at
      ), 'null'::jsonb)
      from public.garmin_connections g
      where g.user_id = uid
    ),
    'garmin_dailies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'calendar_date', d.calendar_date,
        'resting_heart_rate_bpm', d.resting_heart_rate_bpm,
        'average_heart_rate_bpm', d.average_heart_rate_bpm,
        'moderate_minutes', d.moderate_minutes,
        'vigorous_minutes', d.vigorous_minutes,
        'active_kilocalories', d.active_kilocalories,
        'steps', d.steps,
        'distance_metres', d.distance_metres,
        'floors_climbed', d.floors_climbed,
        'min_heart_rate_bpm', d.min_heart_rate_bpm,
        'max_heart_rate_bpm', d.max_heart_rate_bpm,
        'average_stress_level', d.average_stress_level,
        'body_battery_charged', d.body_battery_charged,
        'body_battery_drained', d.body_battery_drained,
        'body_battery_highest', d.body_battery_highest,
        'body_battery_lowest', d.body_battery_lowest,
        'step_goal', d.step_goal,
        'duration_seconds', d.duration_seconds
      ) order by d.calendar_date), '[]'::jsonb)
      from public.garmin_dailies d
      where d.user_id = uid
    ),
    'garmin_activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', a.summary_id,
        'activity_type', a.activity_type,
        'activity_name', a.activity_name,
        'started_at', a.started_at,
        'duration_seconds', a.duration_seconds,
        'average_heart_rate_bpm', a.average_heart_rate_bpm,
        'training_effect', a.training_effect,
        'anaerobic_effect', a.anaerobic_effect
      ) order by a.started_at), '[]'::jsonb)
      from public.garmin_activities a
      where a.user_id = uid
    ),
    'garmin_sleep', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', s.summary_id,
        'calendar_date', s.calendar_date,
        'duration_seconds', s.duration_seconds,
        'deep_seconds', s.deep_seconds,
        'light_seconds', s.light_seconds,
        'rem_seconds', s.rem_seconds,
        'awake_seconds', s.awake_seconds,
        'sleep_score', s.sleep_score
      ) order by s.calendar_date), '[]'::jsonb)
      from public.garmin_sleep s
      where s.user_id = uid
    ),
    'garmin_user_metrics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', m.summary_id,
        'calendar_date', m.calendar_date,
        'vo2_max', m.vo2_max,
        'vo2_max_cycling', m.vo2_max_cycling,
        'fitness_age', m.fitness_age
      ) order by m.calendar_date), '[]'::jsonb)
      from public.garmin_user_metrics m
      where m.user_id = uid
    ),
    'garmin_respiration', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', r.summary_id,
        'calendar_date', r.calendar_date,
        'average_breaths_per_minute', r.average_breaths_per_minute,
        'highest_breaths_per_minute', r.highest_breaths_per_minute,
        'lowest_breaths_per_minute', r.lowest_breaths_per_minute
      ) order by r.calendar_date), '[]'::jsonb)
      from public.garmin_respiration r
      where r.user_id = uid
    ),
    'garmin_pulse_ox', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', p.summary_id,
        'calendar_date', p.calendar_date,
        'average_spo2', p.average_spo2,
        'lowest_spo2', p.lowest_spo2,
        'highest_spo2', p.highest_spo2
      ) order by p.calendar_date), '[]'::jsonb)
      from public.garmin_pulse_ox p
      where p.user_id = uid
    ),
    'buddy_photos', (
      select coalesce(jsonb_agg(to_jsonb(bp) order by bp.created_at), '[]'::jsonb)
      from public.buddy_photos bp
      where bp.owner_id = uid
    ),
    'buddy_photos_shared_with_me', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'owner_id', bp.owner_id,
        'caption', bp.caption,
        'storage_path', bp.storage_path,
        'allow_save', bp.allow_save,
        'created_at', bp.created_at,
        'published_at', bp.published_at
      ) order by bp.created_at), '[]'::jsonb)
      from public.buddy_photos bp
      join public.buddy_photo_recipients br on br.photo_id = bp.id
      where br.buddy_id = uid
        and br.hidden_at is null
        and bp.published_at is not null
    ),
    'buddy_photo_recipients', (
      select coalesce(jsonb_agg(to_jsonb(br)), '[]'::jsonb)
      from public.buddy_photo_recipients br
      join public.buddy_photos bp on bp.id = br.photo_id
      where bp.owner_id = uid
    ),
    'outdoor_routes', (
      select coalesce(jsonb_agg((to_jsonb(r) - 'geometry') order by r.created_at), '[]'::jsonb)
      from public.outdoor_routes r
      where r.user_id = uid
    ),
    'planned_sessions', (
      select coalesce(jsonb_agg(to_jsonb(ps) order by ps.starts_at), '[]'::jsonb)
      from public.planned_sessions ps
      where ps.user_id = uid
    ),
    'buddy_invites', (
      select coalesce(jsonb_agg(to_jsonb(bi) order by bi.created_at), '[]'::jsonb)
      from public.buddy_invites bi
      where uid in (bi.owner_id, bi.buddy_id)
    ),
    'blocks', (
      select coalesce(jsonb_agg(to_jsonb(bl) order by bl.created_at), '[]'::jsonb)
      from public.blocks bl
      where uid in (bl.blocker_id, bl.blocked_id)
    ),
    'device_tokens', (
      select coalesce(jsonb_agg(to_jsonb(dt) order by dt.created_at), '[]'::jsonb)
      from public.device_tokens dt
      where dt.user_id = uid
    ),
    'message_push_log', (
      select coalesce(jsonb_agg(to_jsonb(mpl) order by mpl.sent_at), '[]'::jsonb)
      from public.message_push_log mpl
      join public.direct_messages dm on dm.id = mpl.message_id
      join public.connections cn on cn.id = dm.connection_id
      where uid in (cn.requester_id, cn.addressee_id)
    ),
    'buddy_invite_push_log', (
      select coalesce(jsonb_agg(to_jsonb(ipl) order by ipl.sent_at), '[]'::jsonb)
      from public.buddy_invite_push_log ipl
      join public.buddy_invites bi2 on bi2.id = ipl.invite_id
      where uid in (bi2.owner_id, bi2.buddy_id)
    ),
    'thumos_motivation_memory', (
      select coalesce(to_jsonb(tm), 'null'::jsonb)
      from public.thumos_motivation_memory tm
      where tm.user_id = uid
    ),
    'buddy_photo_push_log', photo_push,
    'garmin_hrv', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'summary_id', h.summary_id,
        'calendar_date', h.calendar_date,
        'last_night_avg_ms', h.last_night_avg_ms,
        'last_night_5min_high_ms', h.last_night_5min_high_ms
      ) order by h.calendar_date), '[]'::jsonb)
      from public.garmin_hrv h
      where h.user_id = uid
    )
  );
end;
$$;



revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
