-- RLS, role permissions and cross-organization isolation. Runs inside one transaction and rolls back.
begin;
\set ON_ERROR_STOP on

-- ============ A. a different organization sees nothing ============
do $$ declare p1 uuid := t.proj(1); p2 uuid := t.proj(2); p3 uuid := t.proj(3); begin
  perform t.as_user(t.uid('out'));
  perform t.eq(t.count('select 1 from public.projects'), 1::bigint, 'A1 outsider sees exactly one project (their own)');
  perform t.eq(t.count(format('select 1 from public.projects where id=%L', p1)), 0::bigint, 'A2 outsider cannot read org1 project by id');
  perform t.eq(t.count(format('select 1 from public.activities where project_id=%L', p1)), 0::bigint, 'A3 no org1 activities visible');
  perform t.eq(t.count(format('select 1 from public.daily_reports where project_id=%L', p1)), 0::bigint, 'A4 no org1 daily reports visible');
  perform t.eq(t.count(format('select 1 from public.daily_report_lines where project_id=%L', p2)), 0::bigint, 'A5 no org1 report lines visible');
  perform t.eq(t.count(format('select 1 from public.audit_logs where project_id in (%L,%L)', p1, p2)), 0::bigint, 'A6 no org1 audit rows visible');
  perform t.eq(t.count('select 1 from public.organizations'), 1::bigint, 'A7 outsider sees one organization');
  perform t.eq(t.count('select 1 from public.profiles'), 1::bigint, 'A8 outsider sees no org1 profiles');
  perform t.eq(t.count('select 1 from public.v_current_baseline where project_id <> ' || quote_literal(p3)), 0::bigint, 'A9 security_invoker views are RLS-filtered');
  perform t.eq(t.rows(format('update public.projects set name = ''hacked'' where id = %L', p1)), 0::bigint, 'A10 outsider update of org1 project touches 0 rows');
  perform t.eq(t.rows(format('delete from public.projects where id = %L', p1)), 0::bigint, 'A11 outsider delete of org1 project touches 0 rows');
  perform t.throws(format($q$insert into public.daily_reports (project_id, report_date, reporter_id) values (%L, current_date + 30, %L)$q$, p1, t.uid('out')),
                   'row-level security', 'A12 outsider cannot file a report into org1');
  perform t.throws(format($q$insert into public.projects (organization_id, code, name, planned_start, planned_finish, created_by)
                              values ('d0000000-0000-4000-8000-000000000001', 'X', 'Injected', current_date, current_date + 5, %L)$q$, t.uid('out')),
                   'row-level security', 'A13 outsider cannot create a project inside org1');
  perform t.throws(format($q$insert into public.organization_memberships (organization_id, user_id, role)
                              values ('d0000000-0000-4000-8000-000000000001', %L, 'org_admin')$q$, t.uid('out')),
                   'row-level security', 'A14 outsider cannot grant themselves membership of org1');
  perform t.throws(format($q$insert into storage.objects (bucket_id, name, owner) values ('attachments', %L, %L)$q$, p1 || '/x.png', t.uid('out')),
                   'row-level security', 'A15 outsider cannot upload into org1 project folder');
  perform t.throws(format($q$select public.import_daily_reports(%L, '[]'::jsonb)$q$, p1), 'Not allowed', 'A16 outsider cannot call import RPC on org1');
  perform t.as_super();
end $$;

-- ============ B. anon has nothing ============
do $$ begin
  perform t.as_anon();
  perform t.throws('select * from public.projects', 'permission denied', 'B1 anon cannot read projects');
  perform t.throws('select * from public.daily_reports', 'permission denied', 'B2 anon cannot read reports');
  perform t.throws($q$select public.create_organization('x')$q$, 'permission denied', 'B3 anon cannot call create_organization');
  perform t.as_super();
end $$;

-- ============ C. site engineer ============
do $$ declare p1 uuid := t.proj(1); p2 uuid := t.proj(2); begin
  perform t.as_user(t.uid('eng1'));
  perform t.eq(t.count('select 1 from public.projects'), 1::bigint, 'C1 engineer sees only the assigned project');
  perform t.eq(t.count(format('select 1 from public.projects where id=%L', p2)), 0::bigint, 'C2 engineer cannot see an unassigned project in the same org');
  perform t.eq(t.count(format('select 1 from public.daily_reports where project_id=%L', p2)), 0::bigint, 'C3 engineer cannot see unassigned project reports');
  perform t.throws($q$insert into public.projects (organization_id, code, name, planned_start, planned_finish, created_by)
                      values ('d0000000-0000-4000-8000-000000000001', 'ENG', 'Eng project', current_date, current_date + 5, 'a0000000-0000-4000-8000-000000000003')$q$,
                   'row-level security', 'C4 engineer cannot create projects');
  perform t.eq(t.rows(format('update public.projects set name = ''x'' where id = %L', p1)), 0::bigint, 'C5 engineer cannot edit project');
  perform t.throws(format($q$insert into public.activities (project_id, code, name, unit) values (%L, 'ZZ', 'Zed', 'm3')$q$, p1),
                   'row-level security', 'C6 engineer cannot create activities');
  perform t.throws(format($q$insert into public.milestones (project_id, name, target_date) values (%L, 'm', current_date)$q$, p1),
                   'row-level security', 'C7 engineer cannot create milestones');
  perform t.throws(format($q$insert into public.daily_reports (project_id, report_date, reporter_id) values (%L, current_date + 40, %L)$q$, p2, t.uid('eng1')),
                   'row-level security', 'C8 engineer cannot report on an unassigned project');
  perform t.throws(format($q$insert into public.daily_reports (project_id, report_date, reporter_id) values (%L, current_date + 41, %L)$q$, p1, t.uid('pm')),
                   'row-level security|only be created for yourself', 'C9 engineer cannot file a report in someone else''s name');
  perform t.throws(format($q$insert into public.ai_analyses (project_id, requested_by, cutoff_date, model, prompt_version, status, metric_snapshot, result)
                              values (%L, %L, current_date, 'm', 'v1', 'completed', '{}', '{}')$q$, p1, t.uid('eng1')),
                   'row-level security', 'C10 engineer cannot store AI analyses');
  perform t.throws(format($q$insert into public.recovery_plans (project_id, title, created_by) values (%L, 't', %L)$q$, p1, t.uid('eng1')),
                   'row-level security', 'C11 engineer cannot create recovery plans');
  perform t.throws($q$insert into public.audit_logs (action, table_name) values ('X', 'y')$q$, 'permission denied', 'C12 nobody can write audit logs directly');
  perform t.eq(t.count(format('select 1 from public.audit_logs where project_id=%L', p1)), 0::bigint, 'C13 engineer cannot read the audit log');
  perform t.throws(format($q$insert into public.project_memberships (project_id, user_id, role) values (%L, %L, 'project_manager')$q$, p1, t.uid('eng1')),
                   'row-level security', 'C14 engineer cannot promote themselves');
  perform t.as_super();
end $$;

-- ============ D. project manager / org admin ============
do $$ declare p1 uuid := t.proj(1); p3 uuid := t.proj(3); begin
  perform t.as_user(t.uid('pm'));
  perform t.eq(t.count('select 1 from public.projects'), 2::bigint, 'D1 project manager sees both assigned projects, not org2''s');
  perform t.eq(t.rows(format('update public.projects set description = ''pm edit'' where id = %L', p1)), 1::bigint, 'D2 project manager can edit assigned project');
  perform t.eq(t.rows(format('delete from public.projects where id = %L', p1)), 0::bigint, 'D3 project manager cannot delete a project (admin only)');
  perform t.throws(format($q$insert into public.project_memberships (project_id, user_id, role) values (%L, %L, 'site_engineer')$q$, p1, t.uid('out')),
                   'not a member of the project', 'D4 cannot add a user from another organization to a project');
  perform t.throws($q$insert into public.organization_memberships (organization_id, user_id, role) values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'site_engineer')$q$,
                   'row-level security', 'D5 project manager cannot manage org membership');
  perform t.as_user(t.uid('admin'));
  perform t.eq(t.count('select 1 from public.projects'), 2::bigint, 'D6 org admin sees all org1 projects');
  perform t.eq(t.count(format('select 1 from public.projects where id=%L', p3)), 0::bigint, 'D7 org admin cannot see org2 projects');
  perform t.eq(t.count('select 1 from public.organizations'), 1::bigint, 'D8 org admin sees only their organization');
  perform t.ok(t.count(format('select 1 from public.audit_logs where project_id=%L', p1)) > 0, 'D9 org admin can read project audit log');
  perform t.throws($q$update public.organization_memberships set role = 'site_engineer' where user_id = 'a0000000-0000-4000-8000-000000000001'$q$,
                   'at least one admin', 'D10 the last org admin cannot be demoted');
  perform t.as_super();
  perform t.throws($q$delete from public.organization_memberships where user_id = 'a0000000-0000-4000-8000-000000000001'$q$,
                   'at least one admin', 'D11 the last org admin cannot be removed');
end $$;

-- ============ E. constraints and integrity (as the trusted connection) ============
do $$ declare p1 uuid := t.proj(1); begin
  perform t.as_super();
  perform t.throws(format($q$insert into public.projects (organization_id, code, name, planned_start, planned_finish)
                              values ('d0000000-0000-4000-8000-000000000001', 'BAD', 'Bad dates', '2026-02-01', '2026-01-01')$q$), 'check', 'E1 project finish before start is rejected');
  perform t.throws($q$insert into public.projects (organization_id, code, name, planned_start, planned_finish, currency)
                      values ('d0000000-0000-4000-8000-000000000001', 'BAD2', 'Bad cur', '2026-01-01', '2026-02-01', 'inr')$q$, 'check', 'E2 lower-case currency rejected');
  perform t.throws(format($q$update public.projects set organization_id = 'd0000000-0000-4000-8000-000000000002' where id = %L$q$, p1), 'cannot be moved', 'E3 project cannot move between organizations');
  perform t.throws(format($q$insert into public.delay_events (project_id, category, start_date, end_date, description, created_by)
                              values (%L, 'weather', '2026-02-02', '2026-02-01', 'x', %L)$q$, p1, t.uid('eng1')), 'check', 'E4 delay end before start rejected');
  perform t.throws(format($q$insert into public.milestones (project_id, name, target_date, status) values (%L, 'm', current_date, 'achieved')$q$, p1), 'check', 'E5 achieved milestone requires achieved_date');
  perform t.ok(not exists (select 1 from information_schema.columns where table_schema='public' and table_name='delay_events'
               and column_name ~ 'responsible|blame|fault|contractor_id|assigned'), 'E6 delay events have no blame/responsible-party column');
end $$;

rollback;
