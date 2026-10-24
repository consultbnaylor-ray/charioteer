-- Meal time and portion. Additive. Existing meals keep their figures.
--
-- food_logs_all already lets the signed-in person update and delete only
-- their own rows (user_id = auth.uid()), and authenticated already has
-- select, insert, update, and delete on the table. New columns are covered
-- by that table grant. This file does not add another policy.

alter table public.food_logs
  add column if not exists eaten_at timestamptz;

alter table public.food_logs
  add column if not exists portion numeric not null default 1
    check (portion > 0 and portion <= 12);
