-- Garmin permissions may be unknown. Not applied from this repo. Ben reviews this file before it runs.
-- Null means the permissions lookup failed. An empty string means Garmin returned no permissions.
-- No new grant. Owner still cannot read this table. Service role writes the column.

alter table public.garmin_connections
  alter column permissions drop not null;

comment on column public.garmin_connections.permissions is
  'Space-separated Garmin export permissions. Null when the lookup failed. Empty when Garmin returned none.';
