-- Height is private profile data, used only to calculate BMI on Health Stats.
-- It is not copied to the directory. The directory trigger still writes
-- display name, town, visibility, and age only.
-- Column UPDATE only. Default privileges stay revoked.

alter table public.profiles
  add column height_cm numeric(5, 1)
    check (height_cm is null or (height_cm >= 50 and height_cm <= 250));

grant update (height_cm) on public.profiles to authenticated;
