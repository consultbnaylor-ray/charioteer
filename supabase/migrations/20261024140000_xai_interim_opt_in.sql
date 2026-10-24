-- Not applied. Ben approves before this runs.
-- Temporary private choice: continue with Thumos before xAI confirms in writing
-- that they will not keep what is sent. Off for every existing account.
-- The app never ticks this because another consent is on.
--
-- What this exposes
-- The signed-in user can update their own consent_xai_interim column.
-- They can already read their own profile row, and profiles_select_own still
-- limits that read to id = auth.uid(). No new select grant. No new policy.
-- They can already insert and update their own consents rows. The kind check
-- now also allows 'xai_interim'. consents_own still limits those rows to the owner.
-- export_my_data is unchanged. It already returns to_jsonb of the owner's profile
-- and the owner's consent rows, so this column and these rows are in that
-- person's own download and nowhere else.
-- delete_my_account deletes auth.users. profiles.id cascades from that, and
-- consents.user_id cascades from the profile, so the choice is deleted with
-- the account. This file creates no table that could be left behind.
--
-- What this does not expose
-- No directory column, no public_profile field, no buddy share, no community
-- field. Anon receives nothing. is_moderator stays ungranted.

alter table public.profiles
  add column if not exists consent_xai_interim boolean not null default false;

grant update (consent_xai_interim) on public.profiles to authenticated;

alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('age_18', 'health', 'community', 'ai_coach', 'message_notifications', 'terms', 'xai_interim'));
