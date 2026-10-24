-- Widen the nutrition_settings build check so "Carrying extra weight" can be saved.
-- Existing rows stay. This does not drop the column or any data.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'nutrition_settings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%build%'
      and pg_get_constraintdef(con.oid) ilike '%muscular%'
  loop
    execute format('alter table public.nutrition_settings drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.nutrition_settings
  drop constraint if exists nutrition_settings_build_check;

alter table public.nutrition_settings
  add constraint nutrition_settings_build_check
  check (build is null or build in ('muscular', 'average', 'slim', 'carrying_extra'));
