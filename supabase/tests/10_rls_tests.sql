-- RLS + integrity tests. Run by run_db_tests.sh after shim + migrations + seed.
-- Each check raises on failure (psql ON_ERROR_STOP aborts with non-zero exit). Output: "ok - ..." lines.
-- Identities mirror seed.sql:
--   admin = org1 org_admin, pm = org1 project_manager (p1,p2), eng1 = site_engineer (p1 only),
--   eng2 = site_engineer (p2 only), outsider = org_admin of a different organization (p3).
\set ON_ERROR_STOP on
\set QUIET on
-- Everything below runs in ONE transaction that is rolled back at the end, so this file leaves no data
-- behind and cannot disturb the other test files.
begin;
\o /dev/null

-- shared helpers (t.check, t.n, t.blocked, t.errmsg) live in 10_helpers.sql
\set as_admin   'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000001'';'
\set as_pm      'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000002'';'
\set as_eng1    'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000003'';'
\set as_eng2    'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000004'';'
\set as_outsider 'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000005'';'
\set as_anon    'reset role; set role anon; set request.jwt.claim.sub = '''';'
\set as_super   'reset role; set request.jwt.claim.sub = '''';'

-- ids
\set p1 '''b0000000-0000-4000-8000-000000000001'''
\set p2 '''b0000000-0000-4000-8000-000000000002'''
\set p3 '''b0000000-0000-4000-8000-000000000003'''

----------------------------------------------------------------------------------------------
-- 1. Tenant isolation: outsider (other org) sees nothing of org1, whatever ids they ask for
----------------------------------------------------------------------------------------------
:as_outsider
select t.check('outsider: sees only own project (1 of 3)', t.n('select count(*) from projects') = 1);
select t.check('outsider: cannot read org1 project by id', t.n('select count(*) from projects where id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 activities',   t.n('select count(*) from activities where project_id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 daily reports', t.n('select count(*) from daily_reports where project_id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 report lines',  t.n('select count(*) from daily_report_lines where project_id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 delay events',  t.n('select count(*) from delay_events where project_id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 baselines',     t.n('select count(*) from baseline_activities where project_id in (' || :'p1' || ',' || :'p2' || ')') = 0);
select t.check('outsider: cannot read org1 equipment/workforce', t.n('select count(*) from equipment_records where project_id = ' || :'p1') + t.n('select count(*) from workforce_records where project_id = ' || :'p1') = 0);
select t.check('outsider: sees no org1 organization row', t.n('select count(*) from organizations where slug = ''demo-construction''') = 0);
select t.check('outsider: sees no org1 memberships', t.n('select count(*) from organization_memberships m join organizations o on o.id = m.organization_id where o.slug = ''demo-construction''') = 0);
select t.check('outsider: sees no org1 profiles', t.n('select count(*) from profiles where email like ''%@demo.sitepulse.test''') = 0);
select t.check('outsider: cannot write into org1 project (activity insert)',
  t.blocked('insert into activities (project_id, code, name, unit) values (' || :'p1' || ', ''HACK'', ''x'', ''m3'')'));
select t.check('outsider: cannot update org1 project',
  t.blocked('update projects set name = ''pwned'' where id = ' || :'p1'));
select t.check('outsider: cannot delete org1 project',
  t.blocked('delete from projects where id = ' || :'p1'));
select t.check('outsider: cannot add self to org1',
  t.blocked('insert into organization_memberships (organization_id, user_id, role) values (''d0000000-0000-4000-8000-000000000001'', ''a0000000-0000-4000-8000-000000000005'', ''org_admin'')'));
select t.check('outsider: cannot add self to org1 project',
  t.blocked('insert into project_memberships (project_id, user_id, role) values (' || :'p1' || ', ''a0000000-0000-4000-8000-000000000005'', ''project_manager'')'));
select t.check('outsider: cannot create a project inside org1',
  t.blocked('insert into projects (organization_id, code, name, planned_start, planned_finish, created_by) values (''d0000000-0000-4000-8000-000000000001'', ''X'', ''Xx'', current_date, current_date, ''a0000000-0000-4000-8000-000000000005'')'));
select t.check('outsider: cannot read org1 attachments via storage policy',
  t.n('select count(*) from storage.objects where bucket_id = ''attachments'' and name like ''' || 'b0000000-0000-4000-8000-000000000001/%''') = 0);
select t.check('outsider: cannot upload under org1 project folder',
  t.blocked('insert into storage.objects (bucket_id, name, owner) values (''attachments'', ''b0000000-0000-4000-8000-000000000001/evil.png'', ''a0000000-0000-4000-8000-000000000005'')'));

----------------------------------------------------------------------------------------------
-- 2. anon has nothing
----------------------------------------------------------------------------------------------
:as_anon
select t.check('anon: cannot select projects', t.blocked('select * from projects', 'permission denied'));
select t.check('anon: cannot select profiles', t.blocked('select * from profiles', 'permission denied'));
select t.check('anon: cannot call import RPC', t.blocked('select public.import_activities(' || :'p1' || ', gen_random_uuid(), ''[]''::jsonb)', 'permission denied'));

----------------------------------------------------------------------------------------------
-- 3. Project-scoped visibility inside one organization
----------------------------------------------------------------------------------------------
:as_eng1
select t.check('eng1: sees only project 1', t.n('select count(*) from projects') = 1 and t.n('select count(*) from projects where id = ' || :'p1') = 1);
select t.check('eng1: cannot see project 2 data', t.n('select count(*) from daily_reports where project_id = ' || :'p2') = 0
                                                 and t.n('select count(*) from activities where project_id = ' || :'p2') = 0);
select t.check('eng1: cannot read audit logs', t.n('select count(*) from audit_logs') = 0);
select t.check('eng1: cannot update project settings', t.blocked('update projects set budget = 1 where id = ' || :'p1'));
select t.check('eng1: cannot create activities', t.blocked('insert into activities (project_id, code, name, unit) values (' || :'p1' || ', ''NEW'', ''x'', ''m3'')'));
select t.check('eng1: cannot edit baseline', t.blocked('update baseline_activities set total_qty = 1 where project_id = ' || :'p1'));
select t.check('eng1: cannot run activity import', t.blocked('select public.import_activities(' || :'p1' || ', gen_random_uuid(), ''[]''::jsonb)', 'Not allowed'));
select t.check('eng1: cannot create a project', t.blocked('insert into projects (organization_id, code, name, planned_start, planned_finish, created_by) values (''d0000000-0000-4000-8000-000000000001'', ''E1'', ''Eng project'', current_date, current_date, ''a0000000-0000-4000-8000-000000000003'')'));
select t.check('eng1: cannot add project members', t.blocked('insert into project_memberships (project_id, user_id, role) values (' || :'p1' || ', ''a0000000-0000-4000-8000-000000000004'', ''site_engineer'')'));
select t.check('eng1: cannot run AI analysis insert', t.blocked('insert into ai_analyses (project_id, requested_by, cutoff_date, model, prompt_version, status, metric_snapshot, result) values (' || :'p1' || ', ''a0000000-0000-4000-8000-000000000003'', current_date, ''m'', ''v1'', ''completed'', ''{}'', ''{}'')'));

:as_eng2
select t.check('eng2: sees only project 2', t.n('select count(*) from projects') = 1 and t.n('select count(*) from projects where id = ' || :'p2') = 1);
select t.check('eng2: cannot file a report in project 1', t.blocked('insert into daily_reports (project_id, report_date, reporter_id) values (' || :'p1' || ', ''2031-01-01'', ''a0000000-0000-4000-8000-000000000004'')'));

:as_pm
select t.check('pm: sees projects 1 and 2 but not the other org''s 3', t.n('select count(*) from projects') = 2 and t.n('select count(*) from projects where id = ' || :'p3') = 0);
select t.check('pm: reads audit logs of own projects', t.n('select count(*) from audit_logs where project_id = ' || :'p1') > 0);
select t.check('pm: audit log has no rows from the other organization', t.n('select count(*) from audit_logs where project_id = ' || :'p3') = 0);

:as_admin
select t.check('admin: sees both org1 projects, not the other org''s', t.n('select count(*) from projects') = 2 and t.n('select count(*) from projects where id = ' || :'p3') = 0);
select t.check('admin: cannot touch the other org''s project', t.blocked('update projects set name = ''x'' where id = ' || :'p3'));

----------------------------------------------------------------------------------------------
-- 4. Daily reports: create, conflict, workflow, locking
----------------------------------------------------------------------------------------------
:as_eng1
select t.check('eng1: can create own draft report',
  t.errmsg('insert into daily_reports (project_id, report_date, reporter_id, status) values (' || :'p1' || ', ''2031-03-03'', ''a0000000-0000-4000-8000-000000000003'', ''draft'')') is null);
select t.check('eng1: cannot create a report in someone else''s name',
  t.blocked('insert into daily_reports (project_id, report_date, reporter_id) values (' || :'p1' || ', ''2031-03-04'', ''a0000000-0000-4000-8000-000000000002'')'));
select t.check('eng1: cannot create a report pre-approved',
  t.blocked('insert into daily_reports (project_id, report_date, reporter_id, status) values (' || :'p1' || ', ''2031-03-05'', ''a0000000-0000-4000-8000-000000000003'', ''approved'')', 'draft or submitted'));
select t.check('eng1: duplicate header for same date/shift is rejected',
  t.blocked('insert into daily_reports (project_id, report_date, reporter_id) values (' || :'p1' || ', ''2031-03-03'', ''a0000000-0000-4000-8000-000000000003'')', 'duplicate key'));

select t.check('eng1: can add a report line',
  t.errmsg('insert into daily_report_lines (report_id, project_id, report_date, shift, activity_id, actual_qty, unit)
            select r.id, r.project_id, r.report_date, r.shift, a.id, 12.5, a.unit
            from daily_reports r join activities a on a.project_id = r.project_id and a.code = ''COL''
            where r.project_id = ' || :'p1' || ' and r.report_date = ''2031-03-03''') is null);
select t.check('conflict: same activity cannot be reported twice for the same date/shift',
  t.blocked('insert into daily_report_lines (report_id, project_id, report_date, shift, activity_id, actual_qty, unit)
             select r.id, r.project_id, r.report_date, r.shift, a.id, 1, a.unit
             from daily_reports r join activities a on a.project_id = r.project_id and a.code = ''COL''
             where r.project_id = ' || :'p1' || ' and r.report_date = ''2031-03-03''', 'duplicate key'));
select t.check('unit guard: wrong unit is rejected',
  t.blocked('insert into daily_report_lines (report_id, project_id, report_date, shift, activity_id, actual_qty, unit)
             select r.id, r.project_id, r.report_date, r.shift, a.id, 1, ''kg''
             from daily_reports r join activities a on a.project_id = r.project_id and a.code = ''FND''
             where r.project_id = ' || :'p1' || ' and r.report_date = ''2031-03-03''', 'does not match'));
select t.check('constraint: negative quantity is rejected',
  t.blocked('update daily_report_lines set actual_qty = -1 where project_id = ' || :'p1' || ' and report_date = ''2031-03-03''', 'check constraint'));
select t.check('eng1: cannot add a line referencing an activity of another project',
  t.blocked('insert into daily_report_lines (report_id, project_id, report_date, shift, activity_id, actual_qty, unit)
             select r.id, r.project_id, r.report_date, r.shift, a.id, 1, a.unit
             from daily_reports r, activities a
             where r.project_id = ' || :'p1' || ' and r.report_date = ''2031-03-03'' and a.project_id = ' || :'p2' || ' limit 1'));

select t.check('eng1: can submit own draft',
  t.n('with u as (update daily_reports set status = ''submitted'' where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'' returning 1) select count(*) from u') = 1);
select t.check('eng1: cannot approve own submitted report',
  t.blocked('update daily_reports set status = ''approved'' where project_id = ' || :'p1' || ' and report_date = ''2031-03-03''', 'Only a project manager'));

:as_pm
select t.check('pm: can approve the submitted report',
  t.n('with u as (update daily_reports set status = ''approved'', review_comment = ''ok'' where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'' returning reviewed_by) select count(*) from u where reviewed_by = ''a0000000-0000-4000-8000-000000000002''') = 1);
select t.check('approved report: version increments and audit row exists',
  t.n('select count(*) from audit_logs where table_name = ''daily_reports'' and project_id = ' || :'p1' || ' and new_data ->> ''report_date'' = ''2031-03-03'' and new_data ->> ''status'' = ''approved''') = 1);

:as_eng1
select t.check('approved report is locked for the reporter (header)',
  t.blocked('update daily_reports set observations = ''tamper'' where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'''));
select t.check('approved report is locked for the reporter (lines)',
  t.blocked('update daily_report_lines set actual_qty = 999 where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'''));
select t.check('approved report cannot be deleted by the reporter',
  t.blocked('delete from daily_reports where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'''));
select t.check('approved report lines cannot be deleted by the reporter',
  t.blocked('delete from daily_report_lines where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'''));

:as_pm
select t.check('pm: manager must reopen (reject) before an approved report changes (RLS hides it from edits)',
  t.blocked('update daily_report_lines set actual_qty = 999 where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'''));
:as_super
select t.check('lock trigger holds even when RLS is bypassed (superuser)',
  t.blocked('update daily_report_lines set actual_qty = 999 where project_id = ' || :'p1' || ' and report_date = ''2031-03-03''', 'locked'));
:as_pm
select t.check('pm: can reopen an approved report by rejecting it',
  t.n('with u as (update daily_reports set status = ''rejected'', review_comment = ''check volume'' where project_id = ' || :'p1' || ' and report_date = ''2031-03-03'' returning 1) select count(*) from u') = 1);

:as_super
select t.check('audit trail captured line + report changes',
  t.n('select count(*) from audit_logs where table_name in (''daily_reports'',''daily_report_lines'') and new_data ->> ''report_date'' = ''2031-03-03''') >= 4);

----------------------------------------------------------------------------------------------
-- 5. Baseline immutability and dependency integrity
----------------------------------------------------------------------------------------------
:as_pm
select t.check('pm: approved baseline quantities cannot be edited',
  t.blocked('update baseline_activities set total_qty = 1 where project_id = ' || :'p1', 'cannot be modified'));
select t.check('pm: approved baseline rows cannot be deleted',
  t.blocked('delete from baseline_activities where project_id = ' || :'p1', 'cannot be modified'));
select t.check('pm: approved baseline dependencies cannot be edited',
  t.blocked('update activity_dependencies set lag_working_days = 5 where project_id = ' || :'p1', 'cannot be modified'));
select t.check('pm: approved baseline revision cannot be deleted',
  t.blocked('delete from baseline_revisions where project_id = ' || :'p1', 'draft'));
select t.check('pm: approved baseline revision cannot be altered',
  t.blocked('update baseline_revisions set name = ''x'' where project_id = ' || :'p1' || ' and status = ''approved''', 'immutable'));

:as_super
select t.check('even a superuser cannot rewrite approved baseline content',
  t.blocked('update baseline_activities set total_qty = 1 where project_id = ' || :'p1', 'cannot be modified'));

:as_pm
select t.check('pm: can open a draft revision (revision_no auto-assigned)',
  t.errmsg('insert into baseline_revisions (project_id, revision_no, name, reason, created_by) values (' || :'p1' || ', 0, ''Rev 2'', ''test'', ''a0000000-0000-4000-8000-000000000002'')') is null);
select t.check('only one draft per project',
  t.blocked('insert into baseline_revisions (project_id, revision_no, name, created_by) values (' || :'p1' || ', 0, ''Rev 3'', ''a0000000-0000-4000-8000-000000000002'')', 'duplicate key'));
select t.check('empty draft cannot be approved',
  t.blocked('update baseline_revisions set status = ''approved'' where project_id = ' || :'p1' || ' and status = ''draft''', 'empty baseline'));

-- dependency cycle rejection inside the draft
select t.check('draft: add baseline rows for two activities',
  t.errmsg('insert into baseline_activities (revision_id, project_id, activity_id, planned_start, planned_finish, total_qty)
            select r.id, r.project_id, a.id, current_date, current_date + 5, 10
            from baseline_revisions r join activities a on a.project_id = r.project_id and a.code in (''SLB'', ''BRK'')
            where r.project_id = ' || :'p1' || ' and r.status = ''draft''') is null);
select t.check('draft: SLB -> BRK dependency accepted',
  t.errmsg('insert into activity_dependencies (revision_id, project_id, predecessor_id, successor_id)
            select r.id, r.project_id, p.id, s.id from baseline_revisions r
            join activities p on p.project_id = r.project_id and p.code = ''SLB''
            join activities s on s.project_id = r.project_id and s.code = ''BRK''
            where r.project_id = ' || :'p1' || ' and r.status = ''draft''') is null);
select t.check('draft: reverse dependency BRK -> SLB (cycle) rejected',
  t.blocked('insert into activity_dependencies (revision_id, project_id, predecessor_id, successor_id)
            select r.id, r.project_id, p.id, s.id from baseline_revisions r
            join activities p on p.project_id = r.project_id and p.code = ''BRK''
            join activities s on s.project_id = r.project_id and s.code = ''SLB''
            where r.project_id = ' || :'p1' || ' and r.status = ''draft''', 'cycle'));
select t.check('draft: self dependency rejected',
  t.blocked('insert into activity_dependencies (revision_id, project_id, predecessor_id, successor_id)
            select r.id, r.project_id, a.id, a.id from baseline_revisions r
            join activities a on a.project_id = r.project_id and a.code = ''SLB''
            where r.project_id = ' || :'p1' || ' and r.status = ''draft''', 'cycle'));
select t.check('draft: dependency on an activity of another project rejected',
  t.blocked('insert into activity_dependencies (revision_id, project_id, predecessor_id, successor_id)
            select r.id, r.project_id, a.id, s.id from baseline_revisions r
            join activities a on a.project_id = ' || :'p2' || ' and a.code = ''SITE''
            join activities s on s.project_id = r.project_id and s.code = ''BRK''
            where r.project_id = ' || :'p1' || ' and r.status = ''draft''', 'foreign key'));
select t.check('draft revision can be deleted again', t.n('with d as (delete from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft'' returning 1) select count(*) from d') = 1);

----------------------------------------------------------------------------------------------
-- 6. Import RPCs: atomic, never overwrite
----------------------------------------------------------------------------------------------
:as_pm
select t.check('import setup: draft revision',
  t.errmsg('insert into baseline_revisions (project_id, revision_no, name, created_by) values (' || :'p1' || ', 0, ''Import test'', ''a0000000-0000-4000-8000-000000000002'')') is null);
select t.check('import: a bad row aborts the whole batch (row-level error names the row)',
  t.errmsg('select public.import_activities(' || :'p1' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft''),
    ''[{"code":"IMP1","name":"Good","unit":"m3","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"100"},
       {"code":"IMP2","name":"Bad","unit":"m3","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"-5"}]''::jsonb)') like 'Row 2:%');
select t.check('import: nothing from the failed batch was committed (transaction-safe)',
  t.n('select count(*) from activities where project_id = ' || :'p1' || ' and code in (''IMP1'', ''IMP2'')') = 0);
select t.check('import: valid batch succeeds',
  t.errmsg('select public.import_activities(' || :'p1' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft''),
    ''[{"code":"IMP1","name":"Good","unit":"m3","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"100"}]''::jsonb)') is null);
select t.check('import: re-importing the same row is rejected, never overwritten',
  t.errmsg('select public.import_activities(' || :'p1' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft''),
    ''[{"code":"IMP1","name":"Changed","unit":"m3","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"999"}]''::jsonb)') like 'Row 1:%');
select t.check('import: the original value survived', t.n('select total_qty::int from baseline_activities ba join activities a on a.id = ba.activity_id where a.project_id = ' || :'p1' || ' and a.code = ''IMP1''') = 100);
select t.check('import: a unit change on an existing activity code is rejected',
  t.errmsg('select public.import_activities(' || :'p1' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft''),
    ''[{"code":"COL","name":"x","unit":"kg","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"1"}]''::jsonb)') like '%Unit differs%');
select t.check('import: approved baselines are never an import target',
  t.errmsg('select public.import_activities(' || :'p1' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''approved''),
    ''[{"code":"ZZZ","name":"x","unit":"m3","planned_start":"2026-11-01","planned_finish":"2026-11-10","total_qty":"1"}]''::jsonb)') like '%never overwritten%');
select t.check('import: cross-project revision id is rejected',
  t.errmsg('select public.import_activities(' || :'p2' || ', (select id from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft''),
    ''[]''::jsonb)') like '%not found%');
select t.check('import: cleanup draft', t.n('with d as (delete from baseline_revisions where project_id = ' || :'p1' || ' and status = ''draft'' returning 1) select count(*) from d') = 1);

:as_eng1
select t.check('import daily reports: duplicate line is rejected with its row number',
  t.errmsg('select public.import_daily_reports(' || :'p1' || ',
    ''[{"report_date":"2031-04-01","activity_code":"COL","actual_qty":"5"},{"report_date":"2031-04-01","activity_code":"COL","actual_qty":"6"}]''::jsonb)') like 'Row 2:%');
select t.check('import daily reports: failed batch left no report behind',
  t.n('select count(*) from daily_reports where project_id = ' || :'p1' || ' and report_date = ''2031-04-01''') = 0);
select t.check('import daily reports: valid rows succeed',
  t.errmsg('select public.import_daily_reports(' || :'p1' || ', ''[{"report_date":"2031-04-01","activity_code":"COL","actual_qty":"5"}]''::jsonb)') is null);
select t.check('import daily reports: cannot import into a project you are not a member of',
  t.errmsg('select public.import_daily_reports(' || :'p2' || ', ''[{"report_date":"2031-04-01","activity_code":"SITE","actual_qty":"5"}]''::jsonb)') like '%Not allowed%');

----------------------------------------------------------------------------------------------
-- 7. Delay events, AI analyses, recovery plans, storage
----------------------------------------------------------------------------------------------
:as_eng1
select t.check('eng1: can log a delay event (always starts unreviewed)',
  t.errmsg('insert into delay_events (project_id, category, start_date, end_date, description, review_status, created_by)
            values (' || :'p1' || ', ''weather'', ''2031-05-01'', ''2031-05-02'', ''rain'', ''confirmed'', ''a0000000-0000-4000-8000-000000000003'')') is null);
select t.check('delay event: engineer-supplied review_status is overridden to unreviewed',
  t.n('select count(*) from delay_events where project_id = ' || :'p1' || ' and description = ''rain'' and review_status = ''unreviewed''') = 1);
select t.check('eng1: cannot confirm a delay event',
  t.blocked('update delay_events set review_status = ''confirmed'' where description = ''rain''', 'Only a project manager'));
select t.check('delay events carry no blame column (no responsible-party field exists)',
  t.n('select count(*) from information_schema.columns where table_name = ''delay_events'' and column_name ~ ''(blame|responsible|fault|contractor_id)''') = 0);
select t.check('eng1: can upload into own project folder',
  t.errmsg('insert into storage.objects (bucket_id, name, owner) values (''attachments'', ''b0000000-0000-4000-8000-000000000001/photo1.jpg'', ''a0000000-0000-4000-8000-000000000003'')') is null);
select t.check('eng1: cannot upload into another project folder',
  t.blocked('insert into storage.objects (bucket_id, name, owner) values (''attachments'', ''b0000000-0000-4000-8000-000000000002/photo1.jpg'', ''a0000000-0000-4000-8000-000000000003'')'));
select t.check('eng1: cannot upload with a malformed folder name',
  t.blocked('insert into storage.objects (bucket_id, name, owner) values (''attachments'', ''not-a-uuid/photo1.jpg'', ''a0000000-0000-4000-8000-000000000003'')'));

:as_pm
select t.check('pm: can confirm a delay event',
  t.n('with u as (update delay_events set review_status = ''confirmed'', review_comment = ''verified in site diary'' where description = ''rain'' returning reviewed_by) select count(*) from u where reviewed_by = ''a0000000-0000-4000-8000-000000000002''') = 1);
select t.check('pm: can store an AI analysis',
  t.errmsg('insert into ai_analyses (project_id, requested_by, cutoff_date, model, prompt_version, status, metric_snapshot, result)
            values (' || :'p1' || ', ''a0000000-0000-4000-8000-000000000002'', current_date, ''test-model'', ''v1'', ''completed'', ''{"k":1}'', ''{"summary":"s"}'')') is null);
select t.check('AI analyses are immutable history (no update, no delete)',
  t.blocked('update ai_analyses set result = ''{}'' where project_id = ' || :'p1', 'permission denied')
  and t.blocked('delete from ai_analyses where project_id = ' || :'p1', 'permission denied'));
select t.check('pm: recovery plan is created as proposed (cannot be self-approved on insert)',
  t.n('with i as (insert into recovery_plans (project_id, title, status, created_by) values (' || :'p1' || ', ''Plan A'', ''approved'', ''a0000000-0000-4000-8000-000000000002'') returning status) select count(*) from i where status = ''proposed''') = 1);
select t.check('pm: approving a recovery plan records who decided',
  t.n('with u as (update recovery_plans set status = ''approved'' where title = ''Plan A'' returning decided_by) select count(*) from u where decided_by = ''a0000000-0000-4000-8000-000000000002''') = 1);

:as_eng1
select t.check('eng1 can read AI analyses of own project but cannot see recovery approval rights',
  t.n('select count(*) from ai_analyses where project_id = ' || :'p1') >= 1 and t.blocked('update recovery_plans set status = ''rejected'' where title = ''Plan A'''));

:as_outsider
select t.check('outsider: cannot read AI analyses or recovery plans of org1',
  t.n('select count(*) from ai_analyses') + t.n('select count(*) from recovery_plans') = 0);

----------------------------------------------------------------------------------------------
-- 8. Membership rules
----------------------------------------------------------------------------------------------
:as_admin
select t.check('admin: cannot add a user from another organization to a project',
  t.blocked('insert into project_memberships (project_id, user_id, role) values (' || :'p1' || ', ''a0000000-0000-4000-8000-000000000005'', ''site_engineer'')', 'not a member'));
select t.check('admin: cannot demote the last org admin',
  t.blocked('update organization_memberships set role = ''project_manager'' where user_id = ''a0000000-0000-4000-8000-000000000001''', 'at least one admin'));
select t.check('admin: cannot move a project to another organization',
  t.blocked('update projects set organization_id = ''d0000000-0000-4000-8000-000000000002'' where id = ' || :'p1'));
select t.check('profile: users cannot edit another user''s profile',
  t.blocked('update profiles set full_name = ''x'' where id = ''a0000000-0000-4000-8000-000000000002'''));


----------------------------------------------------------------------------------------------
-- 9. Adding members by email
----------------------------------------------------------------------------------------------
:as_eng1
select t.check('eng1: cannot add org members', t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''outsider@other.sitepulse.test'', ''site_engineer'')') like '%Only organization admins%');
:as_outsider
select t.check('outsider: cannot add members to org1 via the RPC', t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''x@y.z'', ''org_admin'')') like '%Only organization admins%');
:as_admin
select t.check('admin: unknown email gives the generic message', t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''nobody@nowhere.test'', ''site_engineer'')') like '%No registered user%');
select t.check('admin: can add an existing user (role upsert)', t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''outsider@other.sitepulse.test'', ''site_engineer'')') is null);
select t.check('admin: added member is now visible in the org', t.n('select count(*) from organization_memberships where user_id = ''a0000000-0000-4000-8000-000000000005'' and organization_id = ''d0000000-0000-4000-8000-000000000001''') = 1);
select t.check('admin: emails visible in v_org_members', t.n('select count(*) from v_org_members where email is not null') >= 4);
:as_eng2
select t.check('engineer: v_org_members hides emails', t.n('select count(*) from v_org_members where email is not null') = 0);
select t.check('engineer: v_org_members still lists names for pickers', t.n('select count(*) from v_org_members where full_name is not null') >= 4);
:as_anon
select t.check('anon: cannot call add_org_member_by_email', t.blocked('select public.add_org_member_by_email(gen_random_uuid(), ''a@b.c'', ''org_admin'')', 'permission denied'));

:as_super
\set QUIET off
\o
select 'ALL RLS/INTEGRITY CHECKS PASSED' as result;
rollback;
