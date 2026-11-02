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
