-- Baseline revision workflow RPC tests. Runs after 20_rpc_tests.sql.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
\set as_pm      'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000002'';'
\set as_eng1    'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000003'';'
\set as_super   'reset role; set request.jwt.claim.sub = '''';'
\set p1 b0000000-0000-4000-8000-000000000001
grant execute on all functions in schema t to authenticated, anon;

:as_super
select count(*) as n_before from baseline_activities where project_id = :'p1' \gset
select count(*) as dep_before from activity_dependencies where project_id = :'p1' \gset
select a.id as col_id from activities a where a.project_id = :'p1' and a.code = 'COL' \gset

:as_eng1
select t.check('draft: site engineer cannot open a draft', t.errmsg(format('select public.create_baseline_draft(%L::uuid, ''x'')', :'p1')) like '%Only a project manager%');

:as_pm
create temp table _r (k text primary key, v uuid);
grant all on _r to authenticated;
select t.check('draft: pm opens a draft; approved baseline is copied (activities + dependencies)',
  t.errmsg(format('insert into _r select ''d'', public.create_baseline_draft(%L::uuid, ''scope change'')', :'p1')) is null
  and t.n('select count(*) from baseline_activities where revision_id = (select v from _r where k = ''d'')') = :n_before
  and t.n('select count(*) from activity_dependencies where revision_id = (select v from _r where k = ''d'')') = :dep_before);
select t.check('draft: second draft is refused', t.errmsg(format('select public.create_baseline_draft(%L::uuid)', :'p1')) like '%already exists%');
select t.check('draft: the approved revision is untouched',
  t.n(format('select count(*) from baseline_activities ba join baseline_revisions r on r.id = ba.revision_id where r.status = ''approved'' and r.project_id = %L', :'p1')) = :n_before);

select t.check('daily plan: targets that do not add up to the total are rejected and nothing is changed',
  t.errmsg(format('select public.set_daily_plan((select v from _r where k = ''d''), %L::uuid, %L::jsonb)', :'col_id',
    json_build_array(json_build_object('plan_date', (select planned_start from baseline_activities where activity_id = :'col_id' limit 1), 'planned_qty', 1))::text)) like '%add up to%'
  and t.n('select count(*) from daily_plans where revision_id = (select v from _r where k = ''d'') and activity_id = ' || quote_literal(:'col_id')) = 0);

select (select total_qty from baseline_activities where activity_id = :'col_id' and revision_id = (select v from _r where k = 'd')) as col_total,
       (select planned_start from baseline_activities where activity_id = :'col_id' and revision_id = (select v from _r where k = 'd')) as col_start,
       (select planned_finish from baseline_activities where activity_id = :'col_id' and revision_id = (select v from _r where k = 'd')) as col_finish \gset

select t.check('daily plan: targets outside the planned span are rejected',
  t.errmsg(format('select public.set_daily_plan((select v from _r where k = ''d''), %L::uuid, %L::jsonb)', :'col_id',
    json_build_array(json_build_object('plan_date', (:'col_start'::date - 5)::text, 'planned_qty', :'col_total'))::text)) like '%outside%');
select t.check('daily plan: exact-sum targets are accepted and switch the activity to custom distribution',
  t.errmsg(format('select public.set_daily_plan((select v from _r where k = ''d''), %L::uuid, %L::jsonb)', :'col_id',
    json_build_array(json_build_object('plan_date', :'col_start', 'planned_qty', 100), json_build_object('plan_date', :'col_finish', 'planned_qty', (:'col_total'::numeric - 100)))::text)) is null
  and t.n('select count(*) from baseline_activities where activity_id = ' || quote_literal(:'col_id') || ' and distribution = ''custom'' and revision_id = (select v from _r where k = ''d'')') = 1);
select t.check('daily plan: an empty list reverts to linear',
  t.errmsg(format('select public.set_daily_plan((select v from _r where k = ''d''), %L::uuid, ''[]'')', :'col_id')) is null
  and t.n('select count(*) from daily_plans where revision_id = (select v from _r where k = ''d'') and activity_id = ' || quote_literal(:'col_id')) = 0);

select t.check('draft: a new activity can be added through the import RPC and is cleaned up on discard',
  t.errmsg(format('select public.import_activities(%L::uuid, (select v from _r where k = ''d''), %L::jsonb)', :'p1',
    '[{"code":"TMP1","name":"Temp","unit":"m3","planned_start":"2027-01-04","planned_finish":"2027-01-08","total_qty":"10"}]')) is null
  and t.n('select count(*) from activities where code = ''TMP1''') = 1);
select t.check('discard: removes the draft and its orphan activity, keeps the approved baseline',
  t.errmsg('select public.discard_baseline_draft((select v from _r where k = ''d''))') is null
  and t.n('select count(*) from activities where code = ''TMP1''') = 0
  and t.n(format('select count(*) from baseline_revisions where project_id = %L and status = ''draft''', :'p1')) = 0
  and t.n(format('select count(*) from baseline_activities ba join baseline_revisions r on r.id = ba.revision_id where r.status = ''approved'' and r.project_id = %L', :'p1')) = :n_before);
select t.check('discard: an approved revision cannot be discarded',
  t.errmsg(format('select public.discard_baseline_draft((select id from baseline_revisions where project_id = %L and status = ''approved''))', :'p1')) like '%Only a draft%');

select t.check('revise: approving a new revision supersedes the old one; history keeps both',
  t.errmsg(format('insert into _r select ''d2'', public.create_baseline_draft(%L::uuid, ''r3'')', :'p1')) is null
  and t.errmsg('update baseline_revisions set status = ''approved'' where id = (select v from _r where k = ''d2'')') is null
  and t.n(format('select count(*) from baseline_revisions where project_id = %L and status = ''approved''', :'p1')) = 1
  and t.n(format('select count(*) from baseline_revisions where project_id = %L and status = ''superseded''', :'p1')) = 1);
select t.check('revise: v_current_baseline now shows the newest approved revision',
  t.n(format('select count(distinct revision_no) from v_current_baseline where project_id = %L', :'p1')) = 1
  and t.n(format('select max(revision_no) from v_current_baseline where project_id = %L', :'p1')) = 2);

:as_super
\o
\set QUIET off
select 'ALL PLAN RPC CHECKS PASSED' as result;
