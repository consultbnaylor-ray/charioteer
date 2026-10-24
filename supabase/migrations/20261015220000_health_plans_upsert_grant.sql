-- The app saves a Health Plan with upsert (on conflict (user_id) do update). PostgREST names every
-- column in the DO UPDATE SET, user_id included, and authenticated had no UPDATE on user_id, so every
-- save failed with 42501 "permission denied for table health_plans".
-- Additive. The row policy (user_id = auth.uid()) still stops anyone writing another person's row.
grant update (user_id) on public.health_plans to authenticated;
