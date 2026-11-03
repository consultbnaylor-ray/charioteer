-- Not applied. Ben approves before this runs.
-- Acknowledgement for a short competition weight cut. Owner-only access is already on nutrition_settings.
-- No new policy. Anonymous users still have no access.

alter table public.nutrition_settings
  add column if not exists competition_cut boolean not null default false,
  add column if not exists competition_cut_at timestamptz,
  add column if not exists competition_cut_version text
    check (competition_cut_version is null or char_length(competition_cut_version) <= 20);
