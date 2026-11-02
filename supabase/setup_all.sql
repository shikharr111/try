-- =====================================================================
-- SitePulse schema  (UNVERIFIED: not executed in the build sandbox; no Postgres server available)
-- Quantities: numeric(18,4). Money: numeric(18,2). Instants: timestamptz. Calendar days: date.
-- =====================================================================

-- ---------- enums ----------
create type public.org_role as enum ('org_admin', 'project_manager', 'site_engineer');
create type public.project_role as enum ('project_manager', 'site_engineer');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.baseline_status as enum ('draft', 'approved', 'superseded');
create type public.report_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.delay_category as enum (
  'labor_shortage', 'equipment_breakdown', 'material_supply_delay', 'weather', 'design_change',
  'rework_quality', 'permits_approvals', 'site_access', 'contractor_coordination', 'other_unknown'
);
create type public.delay_review_status as enum ('unreviewed', 'confirmed', 'dismissed');
create type public.milestone_status as enum ('pending', 'achieved', 'missed');
create type public.recovery_status as enum ('proposed', 'approved', 'rejected', 'superseded');
create type public.analysis_status as enum ('completed', 'failed');

-- ---------- tenancy ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.organization_memberships (user_id);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 40),
  name text not null check (length(trim(name)) between 2 and 160),
  location text,
  description text,
  construction_type text,
  planned_start date not null,
  planned_finish date not null,
  budget numeric(18, 2) check (budget is null or budget >= 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status public.project_status not null default 'active',
  manager_id uuid references public.profiles (id) on delete set null,
  working_weekdays smallint[] not null default '{1,2,3,4,5,6}'
    check (cardinality(working_weekdays) between 1 and 7 and working_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  timezone text not null default 'Asia/Kolkata',
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_finish >= planned_start),
  unique (organization_id, code)
);
create index on public.projects (organization_id);

create table public.project_holidays (
  project_id uuid not null references public.projects (id) on delete cascade,
  holiday_date date not null,
  name text,
  primary key (project_id, holiday_date)
);

create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index on public.project_memberships (user_id);

-- ---------- WBS, milestones, activities ----------
create table public.wbs_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.wbs_nodes (id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, code),
  unique (id, project_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  target_date date not null,
  status public.milestone_status not null default 'pending',
  achieved_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'achieved') = (achieved_date is not null))
);
create index on public.milestones (project_id, target_date);

-- Activity = stable identity. Planned dates/quantities live in the baseline revision.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  wbs_node_id uuid,
  code text not null check (length(trim(code)) between 1 and 40),
  name text not null,
  unit text not null check (length(trim(unit)) between 1 and 20),
  weight numeric(12, 4) check (weight is null or weight > 0),
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code),
  unique (id, project_id),
  foreign key (wbs_node_id, project_id) references public.wbs_nodes (id, project_id)
);
create index on public.activities (project_id);

-- ---------- baseline revisions (approved ones are immutable, see triggers) ----------
create table public.baseline_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  revision_no integer not null,
  name text not null default 'Baseline',
  reason text,
  status public.baseline_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, revision_no),
  unique (id, project_id)
);
create unique index baseline_one_draft_per_project on public.baseline_revisions (project_id) where status = 'draft';

create table public.baseline_activities (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  project_id uuid not null,
  activity_id uuid not null,
  planned_start date not null,
  planned_finish date not null,
  total_qty numeric(18, 4) not null check (total_qty >= 0),
  planned_workers numeric(12, 2) check (planned_workers is null or planned_workers >= 0),
  planned_machine_hours numeric(14, 2) check (planned_machine_hours is null or planned_machine_hours >= 0),
  distribution text not null default 'linear' check (distribution in ('linear', 'custom')),
  created_at timestamptz not null default now(),
  check (planned_finish >= planned_start),
  unique (revision_id, activity_id),
  foreign key (revision_id, project_id) references public.baseline_revisions (id, project_id) on delete cascade,
  foreign key (activity_id, project_id) references public.activities (id, project_id) on delete cascade
);
create index on public.baseline_activities (project_id, revision_id);

create table public.activity_dependencies (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  project_id uuid not null,
  predecessor_id uuid not null,
  successor_id uuid not null,
  dependency_type text not null default 'FS' check (dependency_type = 'FS'),
  lag_working_days integer not null default 0 check (lag_working_days between -365 and 365),
  check (predecessor_id <> successor_id),
  unique (revision_id, predecessor_id, successor_id),
  foreign key (revision_id, project_id) references public.baseline_revisions (id, project_id) on delete cascade,
  foreign key (predecessor_id, project_id) references public.activities (id, project_id) on delete cascade,
  foreign key (successor_id, project_id) references public.activities (id, project_id) on delete cascade
);
create index on public.activity_dependencies (project_id, revision_id);

-- Explicit daily/weekly targets (override the linear spread when present)
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  project_id uuid not null,
  activity_id uuid not null,
  plan_date date not null,
  planned_qty numeric(18, 4) not null check (planned_qty >= 0),
  planned_workers numeric(12, 2) check (planned_workers is null or planned_workers >= 0),
  planned_machine_hours numeric(14, 2) check (planned_machine_hours is null or planned_machine_hours >= 0),
  unique (revision_id, activity_id, plan_date),
  foreign key (revision_id, project_id) references public.baseline_revisions (id, project_id) on delete cascade,
  foreign key (activity_id, project_id) references public.activities (id, project_id) on delete cascade
);
create index on public.daily_plans (project_id, activity_id, plan_date);

-- ---------- daily reporting ----------
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  report_date date not null,
  shift text not null default 'day' check (shift in ('day', 'night')),
  reporter_id uuid not null references public.profiles (id),
  status public.report_status not null default 'draft',
  weather text,
  site_conditions text,
  observations text,
  version integer not null default 1,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one header per project/date/shift/reporter; line-level uniqueness below stops conflicting reports
  unique (project_id, report_date, shift, reporter_id),
  unique (id, project_id),
  unique (id, project_id, report_date),
  unique (id, project_id, report_date, shift)
);
create index on public.daily_reports (project_id, report_date desc);
create index on public.daily_reports (reporter_id);

create table public.daily_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  project_id uuid not null,
  report_date date not null,
  shift text not null,
  activity_id uuid not null,
  planned_workers numeric(12, 2) check (planned_workers is null or planned_workers >= 0),
  actual_workers numeric(12, 2) check (actual_workers is null or actual_workers >= 0),
  planned_qty numeric(18, 4) check (planned_qty is null or planned_qty >= 0),
  actual_qty numeric(18, 4) not null default 0 check (actual_qty >= 0),
  unit text not null,
  material_available boolean,
  material_notes text,
  material_consumed_qty numeric(18, 4) check (material_consumed_qty is null or material_consumed_qty >= 0),
  material_unit text,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the same activity cannot be reported twice for the same project/date/shift (conflict prevention)
  unique (project_id, activity_id, report_date, shift),
  unique (id, project_id),
  foreign key (report_id, project_id, report_date, shift)
    references public.daily_reports (id, project_id, report_date, shift) on delete cascade on update cascade,
  foreign key (activity_id, project_id) references public.activities (id, project_id)
);
create index on public.daily_report_lines (project_id, report_date);
create index on public.daily_report_lines (activity_id, report_date);
create index on public.daily_report_lines (report_id);

create table public.workforce_records (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  project_id uuid not null,
  report_date date not null,
  activity_id uuid,
  trade text not null,
  planned_workers numeric(12, 2) not null default 0 check (planned_workers >= 0),
  actual_workers numeric(12, 2) not null default 0 check (actual_workers >= 0),
  hours_worked numeric(8, 2) check (hours_worked is null or hours_worked >= 0),
  foreign key (report_id, project_id, report_date)
    references public.daily_reports (id, project_id, report_date) on delete cascade on update cascade,
  foreign key (activity_id, project_id) references public.activities (id, project_id)
);
create unique index workforce_unique_row on public.workforce_records
  (report_id, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trade));
create index on public.workforce_records (project_id, report_date);

create table public.equipment_records (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  project_id uuid not null,
  report_date date not null,
  activity_id uuid,
  machine_type text not null,
  machine_count integer not null default 1 check (machine_count >= 0),
  planned_hours numeric(10, 2) not null default 0 check (planned_hours >= 0),
  operating_hours numeric(10, 2) not null default 0 check (operating_hours >= 0),
  downtime_hours numeric(10, 2) not null default 0 check (downtime_hours >= 0),
  downtime_reason text,
  foreign key (report_id, project_id, report_date)
    references public.daily_reports (id, project_id, report_date) on delete cascade on update cascade,
  foreign key (activity_id, project_id) references public.activities (id, project_id)
);
create unique index equipment_unique_row on public.equipment_records
  (report_id, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(machine_type));
create index on public.equipment_records (project_id, report_date);

-- ---------- delays ----------
-- Deliberately has no "responsible party" column: delay events record what happened,
-- not who is to blame. Correlation alone must not assign fault.
create table public.delay_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  activity_id uuid,
  report_id uuid,
  category public.delay_category not null,
  start_date date not null,
  end_date date not null,
  duration_working_days numeric(6, 2) check (duration_working_days is null or duration_working_days >= 0),
  description text not null,
  evidence text,
  review_status public.delay_review_status not null default 'unreviewed',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (activity_id, project_id) references public.activities (id, project_id) on delete set null (activity_id),
  foreign key (report_id, project_id) references public.daily_reports (id, project_id) on delete set null (report_id),
  unique (id, project_id)
);
create index on public.delay_events (project_id, start_date);
create index on public.delay_events (activity_id);

-- ---------- attachments ----------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  report_id uuid,
  delay_event_id uuid,
  storage_path text not null unique,   -- '<project_id>/<uuid>-<filename>' in bucket "attachments"
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = project_id::text),
  foreign key (report_id, project_id) references public.daily_reports (id, project_id) on delete cascade,
  foreign key (delay_event_id, project_id) references public.delay_events (id, project_id) on delete cascade
);
create index on public.attachments (project_id);
create index on public.attachments (report_id);

-- ---------- AI + recovery ----------
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  cutoff_date date not null,
  model text not null,
  prompt_version text not null,
  status public.analysis_status not null,
  metric_snapshot jsonb not null,   -- exact deterministic metrics the model was given
  result jsonb,                      -- schema-validated model output
  error text,
  created_at timestamptz not null default now(),
  check ((status = 'completed') = (result is not null)),
  unique (id, project_id)
);
create index on public.ai_analyses (project_id, created_at desc);

create table public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  ai_analysis_id uuid,
  title text not null,
  actions jsonb not null default '[]'::jsonb,
  status public.recovery_status not null default 'proposed',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ai_analysis_id, project_id) references public.ai_analyses (id, project_id) on delete set null (ai_analysis_id)
);
create index on public.recovery_plans (project_id, created_at desc);

-- ---------- imports ----------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('activities', 'dependencies', 'daily_reports', 'workforce', 'equipment')),
  file_name text,
  row_count integer not null default 0,
  status text not null check (status in ('committed', 'rejected')),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.import_jobs (project_id, created_at desc);

-- ---------- audit ----------
-- No foreign keys on purpose: audit rows must outlive the rows they describe.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  project_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (project_id, created_at desc);
create index on public.audit_logs (organization_id, created_at desc);
create index on public.audit_logs (table_name, record_id);

-- ---------- views used by the calculation layer (RLS applies to the caller) ----------
create view public.v_current_baseline with (security_invoker = true) as
select ba.project_id, ba.revision_id, r.revision_no, a.id as activity_id, a.code, a.name, a.unit, a.weight,
       a.wbs_node_id, a.sort_order, ba.planned_start, ba.planned_finish, ba.total_qty,
       ba.planned_workers, ba.planned_machine_hours, ba.distribution
from public.baseline_activities ba
join public.baseline_revisions r on r.id = ba.revision_id and r.status = 'approved'
join public.activities a on a.id = ba.activity_id
where r.revision_no = (
  select max(r2.revision_no) from public.baseline_revisions r2
  where r2.project_id = ba.project_id and r2.status = 'approved'
);

-- Reported quantities that count toward progress: submitted or approved (drafts/rejected excluded).
create view public.v_actual_entries with (security_invoker = true) as
select l.project_id, l.activity_id, l.report_date, l.shift, l.actual_qty, l.unit, l.actual_workers,
       l.planned_workers, r.status as report_status, r.id as report_id
from public.daily_report_lines l
join public.daily_reports r on r.id = l.report_id
where r.status in ('submitted', 'approved');
-- =====================================================================
-- Helpers, integrity triggers, audit trail   (UNVERIFIED: not executed in the build sandbox)
-- Convention: auth.uid() IS NULL means a trusted direct connection (migrations, seed, service role
-- running SQL). Rules that are about "who is the user" are skipped there; structural integrity rules
-- (baseline immutability, cycle checks) always apply.
-- =====================================================================

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profile bootstrap ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- authorization helpers (security definer so they bypass RLS and cannot recurse) ----------
create or replace function public.safe_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_memberships m where m.organization_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_memberships m
                 where m.organization_id = p_org and m.user_id = auth.uid() and m.role = 'org_admin');
$$;

create or replace function public.can_create_projects(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_memberships m
                 where m.organization_id = p_org and m.user_id = auth.uid() and m.role in ('org_admin', 'project_manager'));
$$;

create or replace function public.project_org(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.projects where id = p_project;
$$;

-- Read access: org admins of the project's org, or members of the project.
create or replace function public.can_read_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project
      and (public.is_org_admin(p.organization_id)
           or exists (select 1 from public.project_memberships pm where pm.project_id = p.id and pm.user_id = auth.uid()))
  );
$$;

-- Manage access: org admins, or project managers of that project.
create or replace function public.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project
      and (public.is_org_admin(p.organization_id)
           or exists (select 1 from public.project_memberships pm
                      where pm.project_id = p.id and pm.user_id = auth.uid() and pm.role = 'project_manager'))
  );
$$;

-- Anyone who can read a project may file reports for it (site engineers, PMs, org admins).
create or replace function public.can_report_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_read_project(p_project);
$$;

-- Report content may be edited unless the report is approved; by its reporter or a manager.
create or replace function public.can_edit_report(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.daily_reports r
    where r.id = p_report and r.status <> 'approved'
      and (r.reporter_id = auth.uid() or public.can_manage_project(r.project_id))
  );
$$;

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['organizations','profiles','projects','milestones','activities','daily_reports',
                           'daily_report_lines','delay_events','recovery_plans'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- organizations ----------
-- Never leave an organization without an admin.
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'org_admin' and (tg_op = 'DELETE' or new.role <> 'org_admin') then
    if not exists (select 1 from public.organization_memberships m
                   where m.organization_id = old.organization_id and m.role = 'org_admin' and m.id <> old.id) then
      -- allow when the whole organization is being deleted
      if exists (select 1 from public.organizations o where o.id = old.organization_id) then
        raise exception 'An organization must keep at least one admin';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_last_admin before update or delete on public.organization_memberships
  for each row execute function public.protect_last_admin();

create or replace function public.create_organization(p_name text, p_slug text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_slug := coalesce(nullif(p_slug, ''), regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or length(v_slug) < 2 then v_slug := 'org'; end if;
  if exists (select 1 from public.organizations where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
  end if;
  insert into public.organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  insert into public.organization_memberships (organization_id, user_id, role) values (v_org, auth.uid(), 'org_admin');
  return v_org;
end $$;

-- ---------- projects & membership ----------
create or replace function public.project_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into public.project_memberships (project_id, user_id, role)
    values (new.id, auth.uid(), 'project_manager') on conflict do nothing;
  end if;
  if new.manager_id is not null and new.manager_id is distinct from auth.uid()
     and exists (select 1 from public.organization_memberships m where m.organization_id = new.organization_id and m.user_id = new.manager_id) then
    insert into public.project_memberships (project_id, user_id, role)
    values (new.id, new.manager_id, 'project_manager') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger project_after_insert after insert on public.projects
  for each row execute function public.project_after_insert();

create or replace function public.projects_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'A project cannot be moved to another organization';
  end if;
  return new;
end $$;
create trigger projects_guard before update on public.projects
  for each row execute function public.projects_guard();

-- Project members must belong to the project's organization.
create or replace function public.project_membership_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.projects where id = new.project_id;
  if not exists (select 1 from public.organization_memberships m where m.organization_id = v_org and m.user_id = new.user_id) then
    raise exception 'User is not a member of the project''s organization';
  end if;
  return new;
end $$;
create trigger project_membership_guard before insert or update on public.project_memberships
  for each row execute function public.project_membership_guard();

-- ---------- baseline revisions ----------
create or replace function public.baseline_revision_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'New baseline revisions must start as draft'; end if;
    if new.revision_no is null or new.revision_no = 0 then
      select coalesce(max(revision_no), 0) + 1 into new.revision_no from public.baseline_revisions where project_id = new.project_id;
    end if;
    return new;
  end if;

  if old.status = 'superseded' then
    raise exception 'Superseded baseline revisions are read-only';
  end if;
  if old.status = 'approved' then
    if new.status <> 'superseded' then raise exception 'Approved baseline revisions are immutable'; end if;
    if (new.name, new.reason, new.revision_no, new.project_id, new.approved_by, new.approved_at)
       is distinct from (old.name, old.reason, old.revision_no, old.project_id, old.approved_by, old.approved_at) then
      raise exception 'Approved baseline revisions are immutable';
    end if;
    return new;
  end if;
  -- draft
  if new.status = 'approved' then
    if auth.uid() is not null and not public.can_manage_project(old.project_id) then
      raise exception 'Only a project manager or organization admin may approve a baseline';
    end if;
    if not exists (select 1 from public.baseline_activities where revision_id = old.id) then
      raise exception 'Cannot approve an empty baseline';
    end if;
    new.approved_by := coalesce(auth.uid(), new.approved_by);
    new.approved_at := now();
  elsif new.status = 'superseded' then
    raise exception 'A draft cannot be superseded';
  end if;
  return new;
end $$;
create trigger baseline_revision_guard before insert or update on public.baseline_revisions
  for each row execute function public.baseline_revision_guard();

create or replace function public.baseline_revision_after_approve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status = 'draft' then
    update public.baseline_revisions set status = 'superseded'
    where project_id = new.project_id and status = 'approved' and id <> new.id;
  end if;
  return null;
end $$;
create trigger baseline_revision_after_approve after update on public.baseline_revisions
  for each row execute function public.baseline_revision_after_approve();

-- Content of non-draft revisions can never change (applies to everyone, including seed/migrations).
create or replace function public.baseline_content_immutable() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rev uuid; v_status public.baseline_status;
begin
  -- cascade from a deleted project: the project row is already gone, nothing left to protect
  if tg_op = 'DELETE' and not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  v_rev := case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  select status into v_status from public.baseline_revisions where id = v_rev;
  -- revision row already deleted (cascade) => nothing to protect
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Baseline revision is % and cannot be modified; create a new revision instead', v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger baseline_activities_immutable before insert or update or delete on public.baseline_activities
  for each row execute function public.baseline_content_immutable();
create trigger activity_dependencies_immutable before insert or update or delete on public.activity_dependencies
  for each row execute function public.baseline_content_immutable();
create trigger daily_plans_immutable before insert or update or delete on public.daily_plans
  for each row execute function public.baseline_content_immutable();

-- Deleting a baseline revision is only possible while it is a draft.
create or replace function public.baseline_revision_no_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'draft' and exists (select 1 from public.projects p where p.id = old.project_id) then
    raise exception 'Only draft baseline revisions can be deleted';
  end if;
  return old;
end $$;
create trigger baseline_revision_no_delete before delete on public.baseline_revisions
  for each row execute function public.baseline_revision_no_delete();

-- Dependencies: reject cycles within a revision.
create or replace function public.dependency_cycle_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    with recursive downstream(id) as (
      select new.successor_id
      union
      select d.successor_id from public.activity_dependencies d
      join downstream on d.predecessor_id = downstream.id
      where d.revision_id = new.revision_id
    )
    select 1 from downstream where id = new.predecessor_id
  ) then
    raise exception 'This dependency would create a cycle';
  end if;
  return new;
end $$;
create trigger dependency_cycle_guard before insert or update on public.activity_dependencies
  for each row execute function public.dependency_cycle_guard();

-- ---------- daily reports ----------
create or replace function public.daily_report_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if tg_op = 'INSERT' and new.status = 'submitted' and new.submitted_at is null then new.submitted_at := now(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reporter_id <> auth.uid() then raise exception 'Reports can only be created for yourself'; end if;
    if new.status not in ('draft', 'submitted') then raise exception 'New reports must be draft or submitted'; end if;
    new.version := 1;
    new.reviewed_by := null; new.reviewed_at := null; new.review_comment := null;
    new.submitted_at := case when new.status = 'submitted' then now() else null end;
    return new;
  end if;

  -- UPDATE
  if new.reporter_id <> old.reporter_id or new.project_id <> old.project_id then
    raise exception 'Reporter and project of a report cannot change';
  end if;
  if old.status = 'approved' and new.status = 'approved' then
    raise exception 'Approved reports are locked; a manager must reject (reopen) the report before it can be edited';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('draft', 'rejected') and new.status = 'submitted' then
      if not (old.reporter_id = auth.uid() or public.can_manage_project(old.project_id)) then
        raise exception 'Only the reporter or a manager may submit this report';
      end if;
      new.submitted_at := now();
    elsif old.status = 'submitted' and new.status = 'draft' then
      if old.reporter_id <> auth.uid() then raise exception 'Only the reporter may recall a submitted report'; end if;
    elsif old.status in ('submitted', 'approved') and new.status in ('approved', 'rejected') and old.status <> new.status then
      if not public.can_manage_project(old.project_id) then
        raise exception 'Only a project manager or organization admin may review reports';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      raise exception 'Invalid report status transition % -> %', old.status, new.status;
    end if;
  else
    -- review fields can only be changed through a status transition by a manager
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    new.submitted_at := old.submitted_at;
  end if;
  new.version := old.version + 1;
  return new;
end $$;
create trigger daily_report_guard before insert or update on public.daily_reports
  for each row execute function public.daily_report_guard();

-- Lines may not be edited once the parent report is approved.
create or replace function public.report_child_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status public.report_status; v_report uuid;
begin
  v_report := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  select status into v_status from public.daily_reports where id = v_report;
  if v_status = 'approved' then
    raise exception 'Approved reports are locked';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger report_lines_lock before insert or update or delete on public.daily_report_lines
  for each row execute function public.report_child_lock();
create trigger workforce_lock before insert or update or delete on public.workforce_records
  for each row execute function public.report_child_lock();
create trigger equipment_lock before insert or update or delete on public.equipment_records
  for each row execute function public.report_child_lock();

-- Reported unit must equal the activity's approved unit (no silent unit mixing).
create or replace function public.report_line_unit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_unit text;
begin
  select unit into v_unit from public.activities where id = new.activity_id;
  if lower(trim(v_unit)) <> lower(trim(new.unit)) then
    raise exception 'Unit "%" does not match the activity unit "%"', new.unit, v_unit;
  end if;
  return new;
end $$;
create trigger report_line_unit_guard before insert or update on public.daily_report_lines
  for each row execute function public.report_line_unit_guard();

-- ---------- delay events ----------
create or replace function public.delay_event_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid() then raise exception 'created_by must be the current user'; end if;
    new.review_status := 'unreviewed';
    new.reviewed_by := null; new.reviewed_at := null; new.review_comment := null;
    return new;
  end if;
  if new.review_status is distinct from old.review_status
     or new.review_comment is distinct from old.review_comment then
    if not public.can_manage_project(old.project_id) then
      raise exception 'Only a project manager or organization admin may review delay events';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  -- facts of a confirmed event cannot be rewritten by non-managers
  if old.review_status = 'confirmed' and not public.can_manage_project(old.project_id)
     and (new.category, new.start_date, new.end_date, new.description) is distinct from
         (old.category, old.start_date, old.end_date, old.description) then
    raise exception 'Confirmed delay events can only be changed by a manager';
  end if;
  return new;
end $$;
create trigger delay_event_guard before insert or update on public.delay_events
  for each row execute function public.delay_event_guard();

-- ---------- recovery plans (advisory; approval is a recorded human decision) ----------
create or replace function public.recovery_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid() then raise exception 'created_by must be the current user'; end if;
    new.status := 'proposed';
    new.decided_by := null; new.decided_at := null;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      if not public.can_manage_project(old.project_id) then
        raise exception 'Only a project manager or organization admin may approve or reject a recovery plan';
      end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;
  return new;
end $$;
create trigger recovery_plan_guard before insert or update on public.recovery_plans
  for each row execute function public.recovery_plan_guard();

-- ---------- audit trail ----------
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_project uuid; v_org uuid;
begin
  if tg_op = 'DELETE' then v_old := to_jsonb(old); v_row := v_old;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
    if v_old = v_new then return null; end if;
  else v_new := to_jsonb(new); v_row := v_new; end if;

  if tg_table_name = 'projects' then v_project := (v_row ->> 'id')::uuid;
  else v_project := nullif(v_row ->> 'project_id', '')::uuid; end if;

  v_org := nullif(v_row ->> 'organization_id', '')::uuid;
  if v_org is null and v_project is not null then
    select organization_id into v_org from public.projects where id = v_project;
  end if;

  insert into public.audit_logs (organization_id, project_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (v_org, v_project, auth.uid(), tg_op, tg_table_name, v_row ->> 'id', v_old, v_new);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects','project_memberships','organization_memberships','baseline_revisions',
                           'baseline_activities','activity_dependencies','activities','milestones',
                           'daily_reports','daily_report_lines','workforce_records','equipment_records',
                           'delay_events','recovery_plans','attachments','import_jobs'] loop
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;
-- =====================================================================
-- Row Level Security   (UNVERIFIED: not executed in the build sandbox)
--
-- Model
--   org_admin       : full control of every project in their organization
--   project_manager : manages the projects they are assigned to; reviews reports/delays
--   site_engineer   : reads assigned projects, files reports and delay events
-- A user who is not a member of an organization sees none of its rows, whatever ids they supply.
-- Every table has RLS enabled; the anon role has no grants at all (no anonymous access).
-- =====================================================================

-- Lock everything down first, then grant to the authenticated role only. RLS then narrows.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','organization_memberships','projects','project_holidays','project_memberships',
    'wbs_nodes','milestones','activities','baseline_revisions','baseline_activities','activity_dependencies',
    'daily_plans','daily_reports','daily_report_lines','workforce_records','equipment_records','delay_events',
    'attachments','ai_analyses','recovery_plans','import_jobs','audit_logs'] loop
    -- NOT "force": the SECURITY DEFINER helper functions must be able to read membership tables
    -- as their owner without recursing into these policies.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- audit_logs: append-only via triggers; nobody can write directly
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.ai_analyses from authenticated;   -- history is immutable
revoke update, delete on public.import_jobs from authenticated;

-- ---------- organizations ----------
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- creation only through public.create_organization(); no insert/delete policy

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.organization_memberships mine
      join public.organization_memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- organization memberships ----------
create policy orgm_select on public.organization_memberships for select to authenticated
  using (public.is_org_member(organization_id));
create policy orgm_insert on public.organization_memberships for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy orgm_update on public.organization_memberships for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy orgm_delete on public.organization_memberships for delete to authenticated
  using (public.is_org_admin(organization_id) or user_id = auth.uid());   -- members may leave

-- ---------- projects ----------
create policy projects_select on public.projects for select to authenticated
  using (public.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.can_create_projects(organization_id) and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_org_admin(organization_id));

-- ---------- project memberships ----------
create policy pm_select on public.project_memberships for select to authenticated
  using (public.can_read_project(project_id));
create policy pm_insert on public.project_memberships for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy pm_update on public.project_memberships for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy pm_delete on public.project_memberships for delete to authenticated
  using (public.can_manage_project(project_id));

-- ---------- planning data: read = project readers, write = managers ----------
do $$
declare t text;
begin
  foreach t in array array['project_holidays','wbs_nodes','milestones','activities','baseline_revisions',
                           'baseline_activities','activity_dependencies','daily_plans'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.can_read_project(project_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_manage_project(project_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_manage_project(project_id))', t);
  end loop;
end $$;

-- ---------- daily reports ----------
create policy reports_select on public.daily_reports for select to authenticated
  using (public.can_read_project(project_id));
create policy reports_insert on public.daily_reports for insert to authenticated
  with check (public.can_report_project(project_id) and reporter_id = auth.uid());
create policy reports_update on public.daily_reports for update to authenticated
  using (public.can_read_project(project_id) and (reporter_id = auth.uid() or public.can_manage_project(project_id)))
  with check (public.can_read_project(project_id) and (reporter_id = auth.uid() or public.can_manage_project(project_id)));
create policy reports_delete on public.daily_reports for delete to authenticated
  using (status in ('draft', 'rejected')
         and ((reporter_id = auth.uid() and public.can_read_project(project_id)) or public.can_manage_project(project_id)));

-- report children: readable by project readers; writable by whoever can edit the parent report
do $$
declare t text;
begin
  foreach t in array array['daily_report_lines','workforce_records','equipment_records'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.can_read_project(project_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.can_edit_report(report_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.can_edit_report(report_id)) with check (public.can_edit_report(report_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.can_edit_report(report_id))', t);
  end loop;
end $$;

-- ---------- delay events ----------
create policy delays_select on public.delay_events for select to authenticated
  using (public.can_read_project(project_id));
create policy delays_insert on public.delay_events for insert to authenticated
  with check (public.can_report_project(project_id) and created_by = auth.uid());
create policy delays_update on public.delay_events for update to authenticated
  using (public.can_manage_project(project_id) or (created_by = auth.uid() and review_status = 'unreviewed' and public.can_read_project(project_id)))
  with check (public.can_manage_project(project_id) or (created_by = auth.uid() and public.can_read_project(project_id)));
create policy delays_delete on public.delay_events for delete to authenticated
  using (public.can_manage_project(project_id) or (created_by = auth.uid() and review_status = 'unreviewed'));

-- ---------- attachments ----------
create policy attachments_select on public.attachments for select to authenticated
  using (public.can_read_project(project_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_report_project(project_id) and uploaded_by = auth.uid());
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_manage_project(project_id));

-- ---------- AI + recovery ----------
create policy ai_select on public.ai_analyses for select to authenticated
  using (public.can_read_project(project_id));
create policy ai_insert on public.ai_analyses for insert to authenticated
  with check (public.can_manage_project(project_id) and requested_by = auth.uid());

create policy recovery_select on public.recovery_plans for select to authenticated
  using (public.can_read_project(project_id));
create policy recovery_insert on public.recovery_plans for insert to authenticated
  with check (public.can_manage_project(project_id) and created_by = auth.uid());
create policy recovery_update on public.recovery_plans for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy recovery_delete on public.recovery_plans for delete to authenticated
  using (public.can_manage_project(project_id) and status = 'proposed');

-- ---------- imports ----------
create policy imports_select on public.import_jobs for select to authenticated
  using (public.can_read_project(project_id));
create policy imports_insert on public.import_jobs for insert to authenticated
  with check (public.can_report_project(project_id) and created_by = auth.uid());

-- ---------- audit (read only) ----------
create policy audit_select on public.audit_logs for select to authenticated
  using (
    (project_id is not null and public.can_manage_project(project_id))
    or (project_id is null and organization_id is not null and public.is_org_admin(organization_id))
  );
-- =====================================================================
-- Storage policies + transaction-safe import RPCs   (UNVERIFIED: not executed in the build sandbox)
-- All RPCs are SECURITY INVOKER: RLS and the integrity triggers apply to the calling user.
-- A plpgsql function body is one transaction: any raised error rolls back the whole import.
-- =====================================================================

-- ---------- private bucket for report attachments ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 15 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Object path convention: <project_id>/<anything>. The first folder decides access.
create policy attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_project(public.safe_uuid((storage.foldername(name))[1])));
create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_report_project(public.safe_uuid((storage.foldername(name))[1])));
create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and (owner = auth.uid() or public.can_manage_project(public.safe_uuid((storage.foldername(name))[1]))));

-- ---------- import: activities + baseline rows into a DRAFT revision ----------
-- p_rows: [{code,name,unit,wbs_code,planned_start,planned_finish,total_qty,planned_workers,planned_machine_hours,weight}]
-- Never overwrites: existing activities are reused as-is; duplicate baseline rows raise.
create or replace function public.import_activities(p_project uuid, p_revision uuid, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_act uuid; v_wbs uuid; v_created int := 0; v_rows int := 0; v_status public.baseline_status; v_idx int := 0;
begin
  if not public.can_manage_project(p_project) then raise exception 'Not allowed to import into this project'; end if;
  select status into v_status from public.baseline_revisions where id = p_revision and project_id = p_project;
  if v_status is null then raise exception 'Baseline revision not found in this project'; end if;
  if v_status <> 'draft' then raise exception 'Imports only go into a draft revision; approved baselines are never overwritten'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_wbs := null;
      if nullif(r ->> 'wbs_code', '') is not null then
        select id into v_wbs from public.wbs_nodes where project_id = p_project and code = r ->> 'wbs_code';
        if v_wbs is null then
          insert into public.wbs_nodes (project_id, code, name) values (p_project, r ->> 'wbs_code', r ->> 'wbs_code') returning id into v_wbs;
        end if;
      end if;

      select id into v_act from public.activities where project_id = p_project and code = r ->> 'code';
      if v_act is null then
        insert into public.activities (project_id, wbs_node_id, code, name, unit, weight, created_by)
        values (p_project, v_wbs, r ->> 'code', r ->> 'name', r ->> 'unit', nullif(r ->> 'weight', '')::numeric, auth.uid())
        returning id into v_act;
        v_created := v_created + 1;
      elsif not exists (select 1 from public.activities where id = v_act and lower(unit) = lower(r ->> 'unit')) then
        raise exception 'Unit differs from the existing activity''s unit';
      end if;

      insert into public.baseline_activities (revision_id, project_id, activity_id, planned_start, planned_finish,
                                              total_qty, planned_workers, planned_machine_hours)
      values (p_revision, p_project, v_act, (r ->> 'planned_start')::date, (r ->> 'planned_finish')::date,
              (r ->> 'total_qty')::numeric, nullif(r ->> 'planned_workers', '')::numeric,
              nullif(r ->> 'planned_machine_hours', '')::numeric);
      v_rows := v_rows + 1;
    exception when others then
      raise exception 'Row %: % (%)', v_idx, sqlerrm, coalesce(r ->> 'code', '?');
    end;
  end loop;
  return jsonb_build_object('activities_created', v_created, 'baseline_rows', v_rows);
end $$;

-- p_rows: [{predecessor_code, successor_code, lag_working_days}]
create or replace function public.import_dependencies(p_project uuid, p_revision uuid, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_pred uuid; v_succ uuid; v_n int := 0; v_idx int := 0;
begin
  if not public.can_manage_project(p_project) then raise exception 'Not allowed to import into this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    select id into v_pred from public.activities where project_id = p_project and code = r ->> 'predecessor_code';
    select id into v_succ from public.activities where project_id = p_project and code = r ->> 'successor_code';
    if v_pred is null or v_succ is null then
      raise exception 'Row %: unknown activity code (% -> %)', v_idx, r ->> 'predecessor_code', r ->> 'successor_code';
    end if;
    begin
      insert into public.activity_dependencies (revision_id, project_id, predecessor_id, successor_id, lag_working_days)
      values (p_revision, p_project, v_pred, v_succ, coalesce(nullif(r ->> 'lag_working_days', '')::int, 0));
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('dependencies', v_n);
end $$;

-- p_rows: [{report_date, shift, activity_code, planned_workers, actual_workers, planned_qty, actual_qty, unit, observations}]
-- Creates/extends the caller's own report per (date, shift). Existing lines are never overwritten
-- (the unique constraint raises), and approved reports are locked by trigger.
create or replace function public.import_daily_reports(p_project uuid, p_rows jsonb, p_submit boolean default false)
returns jsonb language plpgsql as $$
declare r jsonb; v_report uuid; v_act uuid; v_unit text; v_lines int := 0; v_reports int := 0; v_idx int := 0;
        v_date date; v_shift text;
begin
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_date := (r ->> 'report_date')::date;
      v_shift := coalesce(nullif(r ->> 'shift', ''), 'day');
      select id, unit into v_act, v_unit from public.activities where project_id = p_project and code = r ->> 'activity_code';
      if v_act is null then raise exception 'unknown activity code %', r ->> 'activity_code'; end if;

      select id into v_report from public.daily_reports
       where project_id = p_project and report_date = v_date and shift = v_shift and reporter_id = auth.uid();
      if v_report is null then
        insert into public.daily_reports (project_id, report_date, shift, reporter_id, status)
        values (p_project, v_date, v_shift, auth.uid(), 'draft') returning id into v_report;
        v_reports := v_reports + 1;
      end if;

      insert into public.daily_report_lines (report_id, project_id, report_date, shift, activity_id, planned_workers,
                                             actual_workers, planned_qty, actual_qty, unit, observations)
      values (v_report, p_project, v_date, v_shift, v_act,
              nullif(r ->> 'planned_workers', '')::numeric, nullif(r ->> 'actual_workers', '')::numeric,
              nullif(r ->> 'planned_qty', '')::numeric, (r ->> 'actual_qty')::numeric,
              coalesce(nullif(r ->> 'unit', ''), v_unit), nullif(r ->> 'observations', ''));
      v_lines := v_lines + 1;
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
  end loop;
  if p_submit then
    update public.daily_reports set status = 'submitted'
     where project_id = p_project and reporter_id = auth.uid() and status = 'draft'
       and (report_date, shift) in (select (x ->> 'report_date')::date, coalesce(nullif(x ->> 'shift', ''), 'day')
                                    from jsonb_array_elements(p_rows) x);
  end if;
  return jsonb_build_object('reports_created', v_reports, 'lines', v_lines);
end $$;

-- p_kind 'workforce': [{report_date, shift, activity_code?, trade, planned_workers, actual_workers, hours_worked}]
-- p_kind 'equipment': [{report_date, shift, activity_code?, machine_type, machine_count, planned_hours, operating_hours, downtime_hours, downtime_reason}]
-- The matching daily report (date+shift) must already exist for the caller.
create or replace function public.import_resource_records(p_project uuid, p_kind text, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_report uuid; v_act uuid; v_n int := 0; v_idx int := 0; v_date date; v_shift text;
begin
  if p_kind not in ('workforce', 'equipment') then raise exception 'Unknown kind %', p_kind; end if;
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_date := (r ->> 'report_date')::date;
      v_shift := coalesce(nullif(r ->> 'shift', ''), 'day');
      select id into v_report from public.daily_reports
       where project_id = p_project and report_date = v_date and shift = v_shift and reporter_id = auth.uid();
      if v_report is null then raise exception 'no daily report of yours exists for % (%); import daily reports first', v_date, v_shift; end if;
      v_act := null;
      if nullif(r ->> 'activity_code', '') is not null then
        select id into v_act from public.activities where project_id = p_project and code = r ->> 'activity_code';
        if v_act is null then raise exception 'unknown activity code %', r ->> 'activity_code'; end if;
      end if;
      if p_kind = 'workforce' then
        insert into public.workforce_records (report_id, project_id, report_date, activity_id, trade, planned_workers, actual_workers, hours_worked)
        values (v_report, p_project, v_date, v_act, r ->> 'trade', coalesce(nullif(r ->> 'planned_workers', '')::numeric, 0),
                coalesce(nullif(r ->> 'actual_workers', '')::numeric, 0), nullif(r ->> 'hours_worked', '')::numeric);
      else
        insert into public.equipment_records (report_id, project_id, report_date, activity_id, machine_type, machine_count,
                                              planned_hours, operating_hours, downtime_hours, downtime_reason)
        values (v_report, p_project, v_date, v_act, r ->> 'machine_type', coalesce(nullif(r ->> 'machine_count', '')::int, 1),
                coalesce(nullif(r ->> 'planned_hours', '')::numeric, 0), coalesce(nullif(r ->> 'operating_hours', '')::numeric, 0),
                coalesce(nullif(r ->> 'downtime_hours', '')::numeric, 0), nullif(r ->> 'downtime_reason', ''));
      end if;
      v_n := v_n + 1;
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('records', v_n);
end $$;

revoke all on function public.import_activities(uuid, uuid, jsonb) from public, anon;
revoke all on function public.import_dependencies(uuid, uuid, jsonb) from public, anon;
revoke all on function public.import_daily_reports(uuid, jsonb, boolean) from public, anon;
revoke all on function public.import_resource_records(uuid, text, jsonb) from public, anon;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.import_activities(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_dependencies(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_daily_reports(uuid, jsonb, boolean) to authenticated;
grant execute on function public.import_resource_records(uuid, text, jsonb) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
-- =====================================================================
-- Transactional RPCs used by the application   (verified by supabase/tests/20_rpc_tests.sql)
-- SECURITY INVOKER unless stated: RLS and integrity triggers apply to the caller.
-- =====================================================================

-- Saves a whole daily report (header + activity lines + workforce + equipment) atomically.
-- p_report_id null  => create (reporter = caller); otherwise replace the content of that report.
-- p_header : {report_date, shift, weather, site_conditions, observations}
-- p_lines  : [{activity_id, planned_workers, actual_workers, planned_qty, actual_qty, material_available,
--              material_notes, material_consumed_qty, material_unit, observations}]
-- p_workforce: [{activity_id?, trade, planned_workers, actual_workers, hours_worked}]
-- p_equipment: [{activity_id?, machine_type, machine_count, planned_hours, operating_hours, downtime_hours, downtime_reason}]
-- The unit of every line is taken from the activity, so a reported unit can never disagree with the plan.
create or replace function public.save_daily_report(
  p_project uuid, p_report_id uuid, p_header jsonb, p_lines jsonb,
  p_workforce jsonb default '[]'::jsonb, p_equipment jsonb default '[]'::jsonb, p_submit boolean default false
) returns uuid language plpgsql as $$
declare
  v_id uuid; v_date date; v_shift text; v_tz text; v_today date; v_status public.report_status; r jsonb; v_unit text; v_n int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;

  v_shift := coalesce(nullif(p_header ->> 'shift', ''), 'day');
  if v_shift not in ('day', 'night') then raise exception 'Shift must be day or night'; end if;

  if p_report_id is null then
    v_date := (p_header ->> 'report_date')::date;
    if v_date is null then raise exception 'Report date is required'; end if;
    select timezone into v_tz from public.projects where id = p_project;
    v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
    if v_date > v_today then raise exception 'Report date % is in the future', v_date; end if;
    begin
      insert into public.daily_reports (project_id, report_date, shift, reporter_id, status, weather, site_conditions, observations)
      values (p_project, v_date, v_shift, auth.uid(), 'draft', nullif(p_header ->> 'weather', ''),
              nullif(p_header ->> 'site_conditions', ''), nullif(p_header ->> 'observations', ''))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'You already have a report for % (% shift) on this project; open and edit it instead', v_date, v_shift;
    end;
  else
    select id, status into v_id, v_status from public.daily_reports where id = p_report_id and project_id = p_project;
    if v_id is null then raise exception 'Report not found'; end if;
    if v_status = 'approved' then raise exception 'Approved reports are locked; a manager must reopen (reject) the report first'; end if;
    -- report_date/shift are the report's identity and are not editable here
    update public.daily_reports
       set weather = nullif(p_header ->> 'weather', ''),
           site_conditions = nullif(p_header ->> 'site_conditions', ''),
           observations = nullif(p_header ->> 'observations', '')
     where id = v_id and project_id = p_project;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'You are not allowed to edit this report'; end if;
    delete from public.daily_report_lines where report_id = v_id;
    delete from public.workforce_records where report_id = v_id;
    delete from public.equipment_records where report_id = v_id;
  end if;

  select report_date, shift into v_date, v_shift from public.daily_reports where id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select unit into v_unit from public.activities where id = (r ->> 'activity_id')::uuid and project_id = p_project;
    if v_unit is null then raise exception 'Unknown activity in report line'; end if;
    insert into public.daily_report_lines (report_id, project_id, report_date, shift, activity_id, planned_workers, actual_workers,
                                           planned_qty, actual_qty, unit, material_available, material_notes,
                                           material_consumed_qty, material_unit, observations)
    values (v_id, p_project, v_date, v_shift, (r ->> 'activity_id')::uuid,
            nullif(r ->> 'planned_workers', '')::numeric, nullif(r ->> 'actual_workers', '')::numeric,
            nullif(r ->> 'planned_qty', '')::numeric, coalesce(nullif(r ->> 'actual_qty', '')::numeric, 0), v_unit,
            nullif(r ->> 'material_available', '')::boolean, nullif(r ->> 'material_notes', ''),
            nullif(r ->> 'material_consumed_qty', '')::numeric, nullif(r ->> 'material_unit', ''), nullif(r ->> 'observations', ''));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_workforce, '[]'::jsonb)) loop
    insert into public.workforce_records (report_id, project_id, report_date, activity_id, trade, planned_workers, actual_workers, hours_worked)
    values (v_id, p_project, v_date, nullif(r ->> 'activity_id', '')::uuid, r ->> 'trade',
            coalesce(nullif(r ->> 'planned_workers', '')::numeric, 0), coalesce(nullif(r ->> 'actual_workers', '')::numeric, 0),
            nullif(r ->> 'hours_worked', '')::numeric);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) loop
    insert into public.equipment_records (report_id, project_id, report_date, activity_id, machine_type, machine_count, planned_hours,
                                          operating_hours, downtime_hours, downtime_reason)
    values (v_id, p_project, v_date, nullif(r ->> 'activity_id', '')::uuid, r ->> 'machine_type',
            coalesce(nullif(r ->> 'machine_count', '')::int, 1), coalesce(nullif(r ->> 'planned_hours', '')::numeric, 0),
            coalesce(nullif(r ->> 'operating_hours', '')::numeric, 0), coalesce(nullif(r ->> 'downtime_hours', '')::numeric, 0),
            nullif(r ->> 'downtime_reason', ''));
  end loop;

  if p_submit then
    update public.daily_reports set status = 'submitted' where id = v_id and status in ('draft', 'rejected');
  end if;
  return v_id;
end $$;

-- Org admins add an already-registered user to their organization by exact e-mail match.
-- SECURITY DEFINER because profiles of users who share no organization yet are (rightly) invisible to RLS.
-- Trade-off (documented): an org admin can learn whether an exact e-mail address has an account.
create or replace function public.add_org_member_by_email(p_org uuid, p_email text, p_role public.org_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_org_admin(p_org) then raise exception 'Only organization admins can add members'; end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No registered user with that e-mail. Ask them to sign up first.'; end if;
  insert into public.organization_memberships (organization_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.save_daily_report(uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.add_org_member_by_email(uuid, text, public.org_role) from public, anon;
grant execute on function public.save_daily_report(uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.add_org_member_by_email(uuid, text, public.org_role) to authenticated;
-- =====================================================================
-- Baseline revision workflow RPCs   (verified by supabase/tests/30_plan_tests.sql)
-- SECURITY INVOKER: RLS and the immutability triggers apply to the caller.
-- =====================================================================

-- Opens a new DRAFT revision. When an approved revision exists, its activities, dependencies and daily
-- plans are copied so the manager edits a full schedule. The approved revision itself is never touched.
create or replace function public.create_baseline_draft(p_project uuid, p_reason text default null)
returns uuid language plpgsql as $$
declare v_new uuid; v_src uuid;
begin
  if not public.can_manage_project(p_project) then raise exception 'Only a project manager or organization admin can revise the baseline'; end if;
  if exists (select 1 from public.baseline_revisions where project_id = p_project and status = 'draft') then
    raise exception 'A draft revision already exists; approve or discard it first';
  end if;
  select id into v_src from public.baseline_revisions where project_id = p_project and status = 'approved';
  insert into public.baseline_revisions (project_id, revision_no, name, reason, created_by)
  values (p_project, 0, case when v_src is null then 'Initial baseline' else 'Revision' end, nullif(trim(p_reason), ''), auth.uid())
  returning id into v_new;
  if v_src is not null then
    insert into public.baseline_activities (revision_id, project_id, activity_id, planned_start, planned_finish, total_qty,
                                            planned_workers, planned_machine_hours, distribution)
    select v_new, project_id, activity_id, planned_start, planned_finish, total_qty, planned_workers, planned_machine_hours, distribution
    from public.baseline_activities where revision_id = v_src;
    insert into public.activity_dependencies (revision_id, project_id, predecessor_id, successor_id, dependency_type, lag_working_days)
    select v_new, project_id, predecessor_id, successor_id, dependency_type, lag_working_days
    from public.activity_dependencies where revision_id = v_src;
    insert into public.daily_plans (revision_id, project_id, activity_id, plan_date, planned_qty, planned_workers, planned_machine_hours)
    select v_new, project_id, activity_id, plan_date, planned_qty, planned_workers, planned_machine_hours
    from public.daily_plans where revision_id = v_src;
  end if;
  return v_new;
end $$;

-- Discards a DRAFT revision and any activity that was created only for it (no other revision, no reports).
create or replace function public.discard_baseline_draft(p_revision uuid) returns void
language plpgsql as $$
declare v_project uuid; v_status public.baseline_status;
begin
  select project_id, status into v_project, v_status from public.baseline_revisions where id = p_revision;
  if v_project is null then raise exception 'Revision not found'; end if;
  if v_status <> 'draft' then raise exception 'Only a draft revision can be discarded'; end if;
  if not public.can_manage_project(v_project) then raise exception 'Not allowed'; end if;
  delete from public.baseline_revisions where id = p_revision;
  delete from public.activities a
   where a.project_id = v_project
     and not exists (select 1 from public.baseline_activities b where b.activity_id = a.id)
     and not exists (select 1 from public.daily_report_lines l where l.activity_id = a.id)
     and not exists (select 1 from public.delay_events d where d.activity_id = a.id);
end $$;

-- Replaces an activity's explicit daily targets in a DRAFT revision. p_rows = [{plan_date, planned_qty}].
-- The targets must lie inside the activity's planned span and add up EXACTLY to its total quantity.
-- An empty array reverts the activity to the linear distribution.
create or replace function public.set_daily_plan(p_revision uuid, p_activity uuid, p_rows jsonb)
returns void language plpgsql as $$
declare v_project uuid; v_status public.baseline_status; v_start date; v_finish date; v_total numeric; v_sum numeric; r jsonb; v_n int;
begin
  select project_id, status into v_project, v_status from public.baseline_revisions where id = p_revision;
  if v_project is null then raise exception 'Revision not found'; end if;
  if v_status <> 'draft' then raise exception 'Daily targets can only be edited in a draft revision'; end if;
  if not public.can_manage_project(v_project) then raise exception 'Not allowed'; end if;
  select planned_start, planned_finish, total_qty into v_start, v_finish, v_total
    from public.baseline_activities where revision_id = p_revision and activity_id = p_activity;
  if v_start is null then raise exception 'Activity is not part of this revision'; end if;

  delete from public.daily_plans where revision_id = p_revision and activity_id = p_activity;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n = 0 then
    update public.baseline_activities set distribution = 'linear' where revision_id = p_revision and activity_id = p_activity;
    return;
  end if;
  v_sum := 0;
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r ->> 'plan_date')::date < v_start or (r ->> 'plan_date')::date > v_finish then
      raise exception 'Target date % is outside the activity''s planned span (% to %)', r ->> 'plan_date', v_start, v_finish;
    end if;
    insert into public.daily_plans (revision_id, project_id, activity_id, plan_date, planned_qty)
    values (p_revision, v_project, p_activity, (r ->> 'plan_date')::date, (r ->> 'planned_qty')::numeric);
    v_sum := v_sum + (r ->> 'planned_qty')::numeric;
  end loop;
  if v_sum <> v_total then
    raise exception 'Daily targets add up to % but the activity total is %', v_sum, v_total;
  end if;
  update public.baseline_activities set distribution = 'custom' where revision_id = p_revision and activity_id = p_activity;
end $$;

revoke all on function public.create_baseline_draft(uuid, text) from public, anon;
revoke all on function public.discard_baseline_draft(uuid) from public, anon;
revoke all on function public.set_daily_plan(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_baseline_draft(uuid, text) to authenticated;
grant execute on function public.discard_baseline_draft(uuid) to authenticated;
grant execute on function public.set_daily_plan(uuid, uuid, jsonb) to authenticated;
-- Members of the caller's own organizations, for pickers (project assignment).
-- security_invoker: organization_memberships / profiles RLS applies to the caller. E-mail is only shown to
-- organization admins. (Adding members by e-mail lives in 20261023000005_report_and_member_rpcs.sql.)
create or replace view public.v_org_members with (security_invoker = true) as
select m.organization_id, m.user_id, m.role, p.full_name,
       case when public.is_org_admin(m.organization_id) then p.email else null end as email
from public.organization_memberships m
join public.profiles p on p.id = m.user_id;
grant select on public.v_org_members to authenticated;

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
-- Contact / feedback messages from the website's floating "Contact" button.
-- Anyone (signed in or not) may INSERT; nobody can read them through the API. The site owner reads them in the
-- Supabase dashboard (Table Editor -> contact_messages).
create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  email      text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  message    text not null check (char_length(btrim(message)) between 5 and 2000),
  utm        jsonb check (utm is null or pg_column_size(utm) <= 2000)
);
alter table public.contact_messages enable row level security;
create policy contact_insert on public.contact_messages for insert to anon, authenticated with check (true);
revoke all on public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
