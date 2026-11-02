-- Tests for the transactional RPCs (save_daily_report, add_org_member_by_email). Runs after 10_rls_tests.sql.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set as_admin   'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000001'';'
\set as_pm      'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000002'';'
\set as_eng1    'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000003'';'
\set as_super   'reset role; set request.jwt.claim.sub = '''';'
\set p1 b0000000-0000-4000-8000-000000000001
\set p2 b0000000-0000-4000-8000-000000000002

grant execute on all functions in schema t to authenticated, anon;

-- activity ids by code (resolved as superuser, then used as literal text in dynamic SQL)
:as_super
select a.id as col_id from activities a where a.project_id = :'p1' and a.code = 'COL' \gset
select a.id as fnd_id from activities a where a.project_id = :'p1' and a.code = 'FND' \gset
select a.id as site_id from activities a where a.project_id = :'p2' and a.code = 'SITE' \gset
select (current_date - 400)::text as old_day \gset
select (current_date + 5)::text as future_day \gset

:as_eng1
create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated;

select t.check('save: new report with lines, workforce and equipment is created atomically',
  t.errmsg(format($q$
    insert into _ids select 'r1', public.save_daily_report(%L::uuid, null,
      %L::jsonb, %L::jsonb, %L::jsonb, %L::jsonb, false)$q$,
    :'p1',
    json_build_object('report_date', :'old_day', 'shift', 'day', 'weather', 'Clear', 'observations', 'rpc test')::text,
    json_build_array(
      json_build_object('activity_id', :'col_id', 'planned_workers', 24, 'actual_workers', 20, 'planned_qty', 25, 'actual_qty', 21.5),
      json_build_object('activity_id', :'fnd_id', 'actual_qty', 3))::text,
    json_build_array(json_build_object('activity_id', :'col_id', 'trade', 'Rebar crew', 'planned_workers', 24, 'actual_workers', 20, 'hours_worked', 8))::text,
    json_build_array(json_build_object('activity_id', :'col_id', 'machine_type', 'Tower crane', 'machine_count', 1, 'planned_hours', 8, 'operating_hours', 6.5, 'downtime_hours', 1.5))::text
  )) is null);

select t.check('save: all four tables were written',
  t.n('select count(*) from daily_report_lines where report_id = (select v from _ids where k = ''r1'')') = 2
  and t.n('select count(*) from workforce_records where report_id = (select v from _ids where k = ''r1'')') = 1
  and t.n('select count(*) from equipment_records where report_id = (select v from _ids where k = ''r1'')') = 1);

select t.check('save: unit comes from the activity (cannot disagree with the plan)',
  t.n('select count(*) from daily_report_lines l join activities a on a.id = l.activity_id where l.report_id = (select v from _ids where k = ''r1'') and l.unit = a.unit') = 2);

select t.check('save: decimals are stored exactly',
  t.n('select count(*) from daily_report_lines where report_id = (select v from _ids where k = ''r1'') and actual_qty = 21.5') = 1);

select t.check('save: a duplicate report for the same date/shift is refused with a clear message',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, null, %L::jsonb, '[]'::jsonb)$q$, :'p1',
    json_build_object('report_date', :'old_day')::text)) like '%already have a report%');

select t.check('save: future dates are refused',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, null, %L::jsonb, '[]'::jsonb)$q$, :'p1',
    json_build_object('report_date', :'future_day')::text)) like '%in the future%');

select t.check('save: editing replaces content, bumps the version, and keeps the same report',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, (select v from _ids where k = 'r1'), %L::jsonb, %L::jsonb)$q$, :'p1',
    json_build_object('weather', 'Rain')::text,
    json_build_array(json_build_object('activity_id', :'col_id', 'actual_qty', 30))::text)) is null);
select t.check('edit: lines replaced, weather updated, version incremented',
  t.n('select count(*) from daily_report_lines where report_id = (select v from _ids where k = ''r1'')') = 1
  and t.n('select count(*) from daily_reports where id = (select v from _ids where k = ''r1'') and weather = ''Rain'' and version >= 2') = 1);

select t.check('edit: a failing line rolls back the whole edit (old content survives)',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, (select v from _ids where k = 'r1'), %L::jsonb, %L::jsonb)$q$, :'p1',
    json_build_object('weather', 'Hail')::text,
    json_build_array(json_build_object('activity_id', :'col_id', 'actual_qty', 1), json_build_object('activity_id', :'col_id', 'actual_qty', 2))::text)) is not null
  and t.n('select count(*) from daily_report_lines where report_id = (select v from _ids where k = ''r1'') and actual_qty = 30') = 1
  and t.n('select count(*) from daily_reports where id = (select v from _ids where k = ''r1'') and weather = ''Rain''') = 1);

select t.check('save: activity from another project is refused',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, (select v from _ids where k = 'r1'), '{}'::jsonb, %L::jsonb)$q$, :'p1',
    json_build_array(json_build_object('activity_id', :'site_id', 'actual_qty', 1))::text)) like '%Unknown activity%');

select t.check('save: cannot write to a project you are not a member of',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, null, %L::jsonb, '[]'::jsonb)$q$, :'p2',
    json_build_object('report_date', :'old_day')::text)) like '%Not allowed%');

select t.check('save: submit flag moves a draft to submitted',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, (select v from _ids where k = 'r1'), '{}'::jsonb, %L::jsonb, '[]', '[]', true)$q$, :'p1',
    json_build_array(json_build_object('activity_id', :'col_id', 'actual_qty', 30))::text)) is null
  and t.n('select count(*) from daily_reports where id = (select v from _ids where k = ''r1'') and status = ''submitted''') = 1);

:as_pm
select t.check('review: pm approves the report', t.n('with u as (update daily_reports set status = ''approved'' where id = (select v from _ids where k = ''r1'') returning 1) select count(*) from u') = 1);
:as_eng1
select t.check('save: approved report cannot be re-saved by the reporter',
  t.errmsg(format($q$select public.save_daily_report(%L::uuid, (select v from _ids where k = 'r1'), '{}'::jsonb, '[]'::jsonb)$q$, :'p1')) like '%locked%');

-- add_org_member_by_email
:as_super
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated', 'newhire@demo.sitepulse.test', '{"full_name":"New Hire"}', now(), now());
:as_super
select t.check('member: profile was created by the signup trigger', t.n('select count(*) from profiles where email = ''newhire@demo.sitepulse.test''') = 1);
:as_admin
select t.check('member: org admin can add a registered user by e-mail (case-insensitive)',
  t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', '' NewHire@Demo.Sitepulse.Test '', ''site_engineer'')') is null);
select t.check('member: the user is now a member and visible', t.n('select count(*) from organization_memberships where user_id = ''a0000000-0000-4000-8000-0000000000aa''') = 1);
select t.check('member: unknown e-mail gives a clear error',
  t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''ghost@nowhere.test'', ''site_engineer'')') like '%No registered user%');
:as_eng1
select t.check('member: a site engineer cannot add members',
  t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''newhire@demo.sitepulse.test'', ''org_admin'')') like '%Only organization admins%');
:as_pm
select t.check('member: a project manager cannot add org members either',
  t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000001'', ''newhire@demo.sitepulse.test'', ''org_admin'')') like '%Only organization admins%');
:as_admin
select t.check('member: admin of org1 cannot add into another organization',
  t.errmsg('select public.add_org_member_by_email(''d0000000-0000-4000-8000-000000000002'', ''newhire@demo.sitepulse.test'', ''site_engineer'')') like '%Only organization admins%');

:as_super
\o
\set QUIET off
select 'ALL RPC CHECKS PASSED' as result;
