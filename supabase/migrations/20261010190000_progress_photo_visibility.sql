-- Opt-in sharing for progress photos. Additive: one column, one read policy,
-- and column grants. Storage policies are unchanged, so a private object
-- stays unreadable to everyone except the owner. Shared bytes are handed
-- out by the progress-photo-url edge function, and only after this policy
-- has already allowed the row.

alter table public.progress_photos
  add column visibility text not null default 'private'
  check (visibility in ('private', 'community'));

create policy progress_photos_community_read on public.progress_photos
  for select to authenticated
  using (visibility = 'community');

grant select (visibility) on public.progress_photos to authenticated;
grant update (visibility) on public.progress_photos to authenticated;
