-- Buddy photo push log. NOT APPLIED.
-- Ben reviews this file before it runs. Do not apply it from the app or from CI.
-- No database webhook and no trigger. After this table exists, deploy
-- supabase/functions/notify-buddy-photo. The app calls that function after publish_buddy_photo.
--
-- The alert reuses profiles.message_notifications, the Profile switch labelled
-- "Turn off Message Notifications (messages from other users)".
-- There is no new column and no separate photo switch. A photo is not a message,
-- and that label still says messages. It is the only switch for alerts from other
-- people, so a photo push follows it. notify_sender_name is not read.
-- The alert text is fixed: "New photo on Charioteer".
--
-- This table stores no photo text, no sender name, and no push token.

create table public.buddy_photo_push_log (
  photo_id uuid not null references public.buddy_photos (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  coalesced boolean not null default false,
  tickets jsonb,
  primary key (photo_id, recipient_id)
);

create index buddy_photo_push_log_recipient_sent
  on public.buddy_photo_push_log (recipient_id, sent_at desc)
  where coalesced = false;

revoke all on table public.buddy_photo_push_log from public, anon, authenticated;

alter table public.buddy_photo_push_log enable row level security;

comment on table public.buddy_photo_push_log is
  'One row per published buddy photo and recipient. notify-buddy-photo writes it with the service role. coalesced means the alert was folded into one sent in the last three minutes and Expo was not called. No photo text and no token.';

comment on column public.buddy_photo_push_log.coalesced is
  'True when this photo did not send its own alert because this recipient already received one inside the window.';

comment on column public.buddy_photo_push_log.tickets is
  'Expo ticket id, status, and error code only. No token and no photo text.';
