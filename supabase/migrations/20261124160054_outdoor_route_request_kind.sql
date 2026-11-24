-- Place searches are counted apart from route requests.
-- Existing rows stay kind 'route'. The phone still has no grant.

alter table public.outdoor_route_requests
  add column if not exists kind text not null default 'route';

alter table public.outdoor_route_requests
  drop constraint if exists outdoor_route_requests_kind_check;

alter table public.outdoor_route_requests
  add constraint outdoor_route_requests_kind_check
  check (kind in ('route', 'search'));

create index if not exists outdoor_route_requests_user_kind_created
  on public.outdoor_route_requests (user_id, kind, created_at desc);

create index if not exists outdoor_route_requests_kind_created
  on public.outdoor_route_requests (kind, created_at desc);

comment on column public.outdoor_route_requests.kind is
  'route or search. A place search does not count toward the route allowance.';
