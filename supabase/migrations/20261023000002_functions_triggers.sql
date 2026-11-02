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
