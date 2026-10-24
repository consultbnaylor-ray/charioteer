-- Name and profile-picture path for an accepted or pending connection.
-- The directory read policy is unchanged: a hidden person stays out of Community and search.
-- This function is the only extra read, and it returns those two fields only.

create or replace function public.my_connection_cards()
returns table (
  user_id uuid,
  display_name text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    other.user_id,
    other.display_name,
    case
      when photo.storage_path = photo.user_id::text || '/' || photo.id::text || '.jpg'
        and photo.storage_path not like '%..%'
      then photo.storage_path
      else null
    end as avatar_path
  from public.connections c
  join public.directory other
    on other.user_id = case
      when c.requester_id = auth.uid() then c.addressee_id
      else c.requester_id
    end
  left join public.profile_photos photo
    on photo.id = other.avatar_photo_id
    and photo.user_id = other.user_id
    and photo.role = 'avatar'
  where auth.uid() is not null
    and c.status in ('accepted', 'pending')
    and auth.uid() in (c.requester_id, c.addressee_id)
    and other.user_id <> auth.uid()
    and not public.is_blocked(auth.uid(), other.user_id);
$$;

revoke all on function public.my_connection_cards() from public, anon, authenticated;
grant execute on function public.my_connection_cards() to authenticated;
