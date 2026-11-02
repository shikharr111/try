-- InfraTrack workspace data (the /workspace screens). One private set of rows per signed-in user,
-- kept apart from the SitePulse tables (it_ prefix). Every row carries owner_id = auth.uid(); RLS lets a user
-- see and change only their own rows. A project's data is one row of JSON documents with a revision counter
-- (optimistic concurrency: the app updates "where rev = <rev it read>" and treats 0 rows as a conflict).

create table public.it_projects (
  owner_id     uuid not null references auth.users (id) on delete cascade,
  id           text not null check (char_length(id) between 1 and 80),
  name         text not null check (char_length(name) between 1 and 300),
  client       text check (char_length(client) <= 300),
  contractor   text check (char_length(contractor) <= 300),
  pm           text check (char_length(pm) <= 300),
  start_text   text check (char_length(start_text) <= 100),
  planned_text text check (char_length(planned_text) <= 100),
  forecast     text check (char_length(forecast) <= 100),
  value        text check (char_length(value) <= 100),
  "position"   integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.it_project_data (
  owner_id   uuid not null,
  project_id text not null,
  plan       jsonb,
  actuals    jsonb not null default '[]'::jsonb,
  activities jsonb not null default '[]'::jsonb,
  act_logs   jsonb not null default '[]'::jsonb,
  costs      jsonb not null default '[]'::jsonb,
  incidents  jsonb not null default '[]'::jsonb,
  rev        integer not null default 1 check (rev >= 1),
  updated_at timestamptz not null default now(),
  primary key (owner_id, project_id),
  foreign key (owner_id, project_id) references public.it_projects (owner_id, id) on delete cascade,
  -- generous per-document ceilings so one account cannot store unbounded data
  check (pg_column_size(plan) <= 2000000 and pg_column_size(actuals) <= 8000000 and pg_column_size(activities) <= 4000000
     and pg_column_size(act_logs) <= 8000000 and pg_column_size(costs) <= 4000000 and pg_column_size(incidents) <= 4000000)
);

create table public.it_user_state (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  audit      jsonb not null default '[]'::jsonb,
  meta       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (pg_column_size(audit) <= 4000000 and pg_column_size(meta) <= 100000)
);

create or replace function public.it_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger it_project_data_touch before update on public.it_project_data for each row execute function public.it_touch_updated_at();
create trigger it_user_state_touch before update on public.it_user_state for each row execute function public.it_touch_updated_at();

alter table public.it_projects enable row level security;
alter table public.it_project_data enable row level security;
alter table public.it_user_state enable row level security;

create policy it_projects_own on public.it_projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy it_project_data_own on public.it_project_data for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy it_user_state_own on public.it_user_state for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.it_projects, public.it_project_data, public.it_user_state from anon, authenticated;
grant select, insert, update, delete on public.it_projects, public.it_project_data, public.it_user_state to authenticated;
