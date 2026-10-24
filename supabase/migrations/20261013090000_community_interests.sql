-- More community interests, so the list is not only fitness.
-- Comedy, Cozy Nights In, Sober Nights Out, Travel, TV Series, Films.
--
-- Additive. Inserts a catalogue row only when that id, slug, and name are
-- all free. on conflict (slug) do nothing if a row already uses the slug.
-- Existing selections are left as they are.

insert into public.interests (id, slug, label)
select v.id, v.slug, v.label
from (
  values
    ('10000000-0000-4000-8000-000000000014'::uuid, 'comedy', 'Comedy'),
    ('10000000-0000-4000-8000-000000000015'::uuid, 'cozy-nights-in', 'Cozy Nights In'),
    ('10000000-0000-4000-8000-000000000019'::uuid, 'films', 'Films'),
    ('10000000-0000-4000-8000-000000000016'::uuid, 'sober-nights-out', 'Sober Nights Out'),
    ('10000000-0000-4000-8000-000000000017'::uuid, 'travel', 'Travel'),
    ('10000000-0000-4000-8000-000000000018'::uuid, 'tv-series', 'TV Series')
) as v(id, slug, label)
where not exists (
  select 1
  from public.interests i
  where i.id = v.id
    or i.slug = v.slug
    or lower(regexp_replace(btrim(i.label), '\s+', ' ', 'g')) = lower(v.label)
)
on conflict (slug) do nothing;
