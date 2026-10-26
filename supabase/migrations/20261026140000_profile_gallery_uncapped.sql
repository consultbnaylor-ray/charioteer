-- Public gallery: no count limit.
-- 20261010300000_profile_photos.sql created profile_photos_limit, which
-- refused a seventh gallery photo with "Six profile photos is the limit."
-- Drop that trigger and function. Do not add another count check.
-- Not applied from this change. Ben applies it.

drop trigger if exists profile_photos_limit on public.profile_photos;
drop function if exists public.profile_photos_limit();
