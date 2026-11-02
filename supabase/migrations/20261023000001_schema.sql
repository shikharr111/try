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
