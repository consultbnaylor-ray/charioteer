-- Build 45 DPIA. Not applied from this repo.
-- Health, the xAI coach, message notifications, and the terms are recorded
-- separately. Each row keeps the version and the time of the latest decision.
-- Message alerts start off for a new account. An existing saved value stays
-- until that person answers the new consent screen.

alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('age_18', 'health', 'community', 'ai_coach', 'message_notifications', 'terms'));

alter table public.consents add column if not exists decided_at timestamptz;
update public.consents set decided_at = created_at where decided_at is null;
alter table public.consents alter column decided_at set default now();
alter table public.consents alter column decided_at set not null;

grant update (granted, decided_at) on public.consents to authenticated;

alter table public.profiles alter column message_notifications set default false;
