-- InfraTrack (it_*) tables: owner-only access, revision conflicts, cascade delete. Runs after 30_plan_tests.sql.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
\set as_a     'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000002'';'
\set as_b     'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000003'';'
\set as_anon  'reset role; set role anon; set request.jwt.claim.sub = '''';'
\set as_super 'reset role; set request.jwt.claim.sub = '''';'
grant execute on all functions in schema t to authenticated, anon;

:as_a
insert into it_projects (owner_id, id, name, client, "position") values (auth.uid(), 'p1', 'Bridge A', 'NHAI', 0);
insert into it_project_data (owner_id, project_id, plan, actuals, rev) values (auth.uid(), 'p1', '{"workers":10}'::jsonb, '[{"date":"2026-10-01"}]'::jsonb, 1);
insert into it_user_state (owner_id, audit) values (auth.uid(), '[{"activity":"x"}]'::jsonb);

select t.check('owner reads own rows',
  t.n('select count(*) from it_projects') = 1 and t.n('select count(*) from it_project_data') = 1 and t.n('select count(*) from it_user_state') = 1);

:as_b
select t.check('another user sees none of them',
  t.n('select count(*) from it_projects') = 0 and t.n('select count(*) from it_project_data') = 0 and t.n('select count(*) from it_user_state') = 0);
select t.check('another user cannot write rows owned by someone else',
  t.errmsg($q$insert into it_projects (owner_id, id, name) values ('a0000000-0000-4000-8000-000000000002', 'evil', 'x')$q$) ilike '%row-level security%');
select t.check('another user cannot update or delete them (0 rows)',
  t.blocked($q$update it_projects set name = 'hacked' where id = 'p1'$q$) and t.blocked($q$delete from it_project_data where project_id = 'p1'$q$));
select t.check('a user cannot hand a row over to someone else by changing owner_id',
  t.errmsg($q$insert into it_user_state (owner_id) values ('a0000000-0000-4000-8000-000000000002')$q$) ilike '%row-level security%');

:as_anon
select t.check('signed-out visitors have no access at all', t.errmsg('select count(*) from it_projects') ilike '%permission denied%');

:as_a
select t.check('revision check: update with the current rev succeeds and bumps it',
  t.rows($q$update it_project_data set actuals = '[]'::jsonb, rev = 2 where owner_id = auth.uid() and project_id = 'p1' and rev = 1$q$) = 1
  and t.n($q$select rev from it_project_data where project_id = 'p1'$q$) = 2);
select t.check('revision check: a stale rev updates nothing (the app reports a conflict)',
  t.rows($q$update it_project_data set actuals = '[1]'::jsonb, rev = 2 where owner_id = auth.uid() and project_id = 'p1' and rev = 1$q$) = 0);
select t.check('upsert with ignore-duplicates does not overwrite an existing document',
  t.rows($q$insert into it_project_data (owner_id, project_id, rev) values (auth.uid(), 'p1', 1) on conflict (owner_id, project_id) do nothing$q$) = 0);
select t.check('project data needs its project',
  t.errmsg($q$insert into it_project_data (owner_id, project_id) values (auth.uid(), 'nope')$q$) ilike '%foreign key%');
select t.check('upsert of a project row merges (on_conflict owner_id,id)',
  t.rows($q$insert into it_projects (owner_id, id, name, "position") values (auth.uid(), 'p1', 'Bridge A v2', 3)
            on conflict (owner_id, id) do update set name = excluded.name, "position" = excluded."position"$q$) = 1
  and t.n($q$select "position" from it_projects where id = 'p1'$q$) = 3);
select t.check('size and length limits are enforced',
  t.errmsg($q$insert into it_projects (owner_id, id, name) values (auth.uid(), 'long', repeat('x', 301))$q$) ilike '%check constraint%');
select t.check('deleting a project removes its data (cascade)',
  t.rows($q$delete from it_projects where id = 'p1'$q$) = 1 and t.n('select count(*) from it_project_data') = 0);

:as_super
\o
\set QUIET off
select 'ALL INFRATRACK CHECKS PASSED' as result;
