-- Build 16. Replaces shared_progress_photos only. No table or data changes.
--
-- A community progress photo was signed for any signed-in viewer, even one the
-- owner had blocked, or when the owner had turned Community off. It now follows
-- the same rules as shared profile pictures: the owner has Community on and is
-- 18 or over, and there is no block in either direction. Same signature.

create or replace function public.shared_progress_photos(photo_ids uuid[] default null)
returns table (
  id uuid,
  user_id uuid,
  taken_on date,
  month_index smallint,
  caption text,
  storage_path text,
  created_at timestamptz,
  visibility text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.user_id, p.taken_on, p.month_index, p.caption, p.storage_path, p.created_at, p.visibility
  from public.progress_photos p
  join public.profiles owner on owner.id = p.user_id
  where auth.uid() is not null
    and p.visibility = 'community'
    and (photo_ids is null or p.id = any(photo_ids))
    and owner.community_visible is true
    and owner.age_confirmed_18 is true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    );
$$;
