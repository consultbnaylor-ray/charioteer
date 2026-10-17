-- Default interest chips: Exercise, Gym, Health and Fitness, Hiking.
--
-- Additive. There is no curated column. A catalogue chip is a row with
-- created_by null; a custom chip is one a person added. This reuses a live
-- row when the slug or the name already exists (Hiking and Gym may have been
-- added as custom interests), clears created_by so it shows as a default,
-- and inserts only when neither the slug nor the name is taken.
-- profile_interests is left alone, so existing choices keep the same id.

insert into public.interests (id, slug, label)
select v.id, v.slug, v.label
from (
  values
    ('10000000-0000-4000-8000-000000000011'::uuid, 'exercise', 'Exercise'),
    ('10000000-0000-4000-8000-000000000012'::uuid, 'gym', 'Gym'),
    ('10000000-0000-4000-8000-000000000013'::uuid, 'health-and-fitness', 'Health and Fitness'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'hiking', 'Hiking')
) as v(id, slug, label)
where not exists (
  select 1
  from public.interests i
  where i.id = v.id
    or i.slug = v.slug
    or lower(regexp_replace(btrim(i.label), '\s+', ' ', 'g')) = lower(v.label)
)
on conflict (slug) do nothing;

update public.interests as i
set
  created_by = null,
  label = v.label
from (
  values
    ('exercise', 'Exercise'),
    ('gym', 'Gym'),
    ('health-and-fitness', 'Health and Fitness'),
    ('hiking', 'Hiking')
) as v(slug, label)
where i.slug = v.slug
  or lower(regexp_replace(btrim(i.label), '\s+', ' ', 'g')) = lower(v.label);
