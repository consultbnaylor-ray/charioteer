-- Charioteer V1. Every table has row-level security.
-- Health, check-ins, reasons, spend, and units are private to the account.
-- Other adults can see only a directory card: name, town or area, and interests.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  sobriety_started_at timestamptz,
  weekly_spend_gbp numeric(10, 2) check (weekly_spend_gbp is null or weekly_spend_gbp >= 0),
  weekly_units numeric(8, 2) check (weekly_units is null or weekly_units >= 0),
  town text check (town is null or char_length(town) <= 80),
  age_confirmed_18 boolean not null default false,
  community_visible boolean not null default false,
  consent_health boolean not null default false,
  consent_ai boolean not null default false,
  onboarding_complete boolean not null default false,
  is_moderator boolean not null default false,
  text_scale text not null default 'default' check (text_scale in ('default', 'large', 'extra')),
  theme_preference text not null default 'dark' check (theme_preference in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.directory (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null default '',
  town text,
  visible boolean not null default false,
  age_confirmed_18 boolean not null default false
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('age_18', 'health', 'community', 'ai_coach')),
  granted boolean not null,
  version text not null,
  created_at timestamptz not null default now()
);

create table public.reasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 1 and 40),
  label text not null check (char_length(label) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null
);

create table public.profile_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  primary key (user_id, interest_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mood smallint not null check (mood between 1 and 5),
  sleep_hours numeric(4, 1) not null check (sleep_hours >= 0 and sleep_hours <= 24),
  craving smallint not null check (craving between 0 and 10),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create table public.relapses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null,
  previous_started_at timestamptz not null,
  days_kept int not null check (days_kept >= 0),
  note text not null default '' check (char_length(note) <= 2000)
);

create table public.health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'steps', 'sleep_hours', 'resting_heart_rate', 'hrv_sdnn', 'workout_minutes', 'weight_kg'
  )),
  value numeric not null,
  unit text not null,
  recorded_on date not null,
  source text not null check (source in ('manual', 'healthkit')),
  created_at timestamptz not null default now(),
  unique (user_id, kind, recorded_on, source)
);

create table public.thumos_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'guide', 'offline')),
  content text not null check (char_length(content) between 1 and 8000),
  mode text not null default 'steady',
  created_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index connections_pair_idx
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reported_name text not null,
  connection_id uuid references public.connections (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 80),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key,
  category text not null check (category in ('quit_lit', 'groups', 'helplines', 'health')),
  title text not null,
  detail text not null,
  url text,
  phone text,
  verification text not null check (verification in ('verified', 'partial', 'unverified')),
  verification_note text not null default '',
  sort_order int not null default 0
);

create index check_ins_user_idx on public.check_ins (user_id, created_at desc);
create index health_user_idx on public.health_samples (user_id, recorded_on desc);
create index thumos_user_idx on public.thumos_messages (user_id, created_at);
create index messages_connection_idx on public.direct_messages (connection_id, created_at);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.directory (user_id, display_name, town, visible, age_confirmed_18)
  values (new.id, new.display_name, new.town, new.community_visible, new.age_confirmed_18)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        town = excluded.town,
        visible = excluded.visible,
        age_confirmed_18 = excluded.age_confirmed_18;
  return new;
end;
$$;

create trigger profiles_sync_directory
  after insert or update of display_name, town, community_visible, age_confirmed_18
  on public.profiles
  for each row execute function public.sync_directory();

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or auth.uid() not in (a, b) then false
    else exists (
      select 1 from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    )
  end;
$$;

create or replace function public.my_is_18()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select age_confirmed_18 from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_moderator from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_read_messages(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    where c.id = cid
      and c.status = 'accepted'
      and auth.uid() in (c.requester_id, c.addressee_id)
      and not public.is_blocked(c.requester_id, c.addressee_id)
  );
$$;

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
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reports r where r.reporter_id = uid)
  );
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.is_blocked(uuid, uuid) from public, anon;
revoke all on function public.my_is_18() from public, anon;
revoke all on function public.is_moderator() from public, anon;
revoke all on function public.can_read_messages(uuid) from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.my_is_18() to authenticated;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.can_read_messages(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.directory enable row level security;
alter table public.consents enable row level security;
alter table public.reasons enable row level security;
alter table public.check_ins enable row level security;
alter table public.relapses enable row level security;
alter table public.health_samples enable row level security;
alter table public.thumos_messages enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.connections enable row level security;
alter table public.direct_messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.resources enable row level security;

revoke all on public.profiles from anon;
revoke all on public.directory from anon;
revoke all on public.consents from anon;
revoke all on public.reasons from anon;
revoke all on public.check_ins from anon;
revoke all on public.relapses from anon;
revoke all on public.health_samples from anon;
revoke all on public.thumos_messages from anon;
revoke all on public.interests from anon;
revoke all on public.profile_interests from anon;
revoke all on public.connections from anon;
revoke all on public.direct_messages from anon;
revoke all on public.blocks from anon;
revoke all on public.reports from anon;
revoke all on public.resources from anon;

grant select, insert on public.profiles to authenticated;
grant update (
  display_name,
  sobriety_started_at,
  weekly_spend_gbp,
  weekly_units,
  town,
  age_confirmed_18,
  community_visible,
  consent_health,
  consent_ai,
  onboarding_complete,
  text_scale,
  theme_preference
) on public.profiles to authenticated;
grant select on public.directory to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, update, delete on public.reasons to authenticated;
grant select, insert on public.check_ins to authenticated;
grant select, insert on public.relapses to authenticated;
grant select, insert, update on public.health_samples to authenticated;
grant select, insert on public.thumos_messages to authenticated;
grant select, insert on public.interests to authenticated;
grant select, insert, delete on public.profile_interests to authenticated;
grant select, insert on public.connections to authenticated;
grant update (status) on public.connections to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant select on public.resources to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy directory_select on public.directory
  for select to authenticated using (
    user_id = auth.uid()
    or (
      visible
      and age_confirmed_18
      and public.my_is_18()
      and not public.is_blocked(auth.uid(), user_id)
    )
  );

create policy consents_own on public.consents
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reasons_own on public.reasons
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy check_ins_own on public.check_ins
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy relapses_own on public.relapses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy health_own on public.health_samples
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy thumos_select_own on public.thumos_messages
  for select to authenticated using (user_id = auth.uid());
create policy thumos_insert_own on public.thumos_messages
  for insert to authenticated with check (
    user_id = auth.uid() and role in ('user', 'guide', 'offline')
  );

create policy interests_read on public.interests
  for select to authenticated using (true);
create policy interests_insert_custom on public.interests
  for insert to authenticated with check (created_by = auth.uid());

create policy profile_interests_write on public.profile_interests
  for insert to authenticated with check (user_id = auth.uid());
create policy profile_interests_delete on public.profile_interests
  for delete to authenticated using (user_id = auth.uid());
create policy profile_interests_read on public.profile_interests
  for select to authenticated using (
    user_id = auth.uid()
    or (
      public.my_is_18()
      and not public.is_blocked(auth.uid(), user_id)
      and exists (
        select 1 from public.directory d
        where d.user_id = profile_interests.user_id
          and d.visible
          and d.age_confirmed_18
      )
    )
  );

create policy connections_select on public.connections
  for select to authenticated using (
    auth.uid() in (requester_id, addressee_id)
    and not public.is_blocked(requester_id, addressee_id)
  );
create policy connections_insert on public.connections
  for insert to authenticated with check (
    requester_id = auth.uid()
    and status = 'pending'
    and public.my_is_18()
    and not public.is_blocked(requester_id, addressee_id)
    and exists (
      select 1 from public.directory d
      where d.user_id = addressee_id and d.visible and d.age_confirmed_18
    )
  );
create policy connections_update on public.connections
  for update to authenticated
  using (auth.uid() in (requester_id, addressee_id))
  with check (
    (auth.uid() = addressee_id and status in ('accepted', 'declined'))
    or (auth.uid() = requester_id and status = 'declined')
  );

create policy messages_select on public.direct_messages
  for select to authenticated using (public.can_read_messages(connection_id));
create policy messages_insert on public.direct_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.can_read_messages(connection_id)
  );

create policy blocks_own on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_select on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());
create policy reports_review on public.reports
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create policy resources_read on public.resources
  for select to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
