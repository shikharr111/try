-- Contact messages: anyone can send one, nobody can read them through the API. Runs after 40_infratrack.sql.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
\set as_a     'reset role; set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-4000-8000-000000000002'';'
\set as_anon  'reset role; set role anon; set request.jwt.claim.sub = '''';'
\set as_super 'reset role; set request.jwt.claim.sub = '''';'
grant execute on all functions in schema t to authenticated, anon;

:as_anon
select t.check('a signed-out visitor can send a message',
  t.rows($q$insert into contact_messages (name, email, message, utm) values ('Asha', 'asha@example.com', 'Hello, a question', '{"utm_source":"x"}')$q$) = 1);
select t.check('a signed-out visitor cannot read messages',
  t.errmsg('select count(*) from contact_messages') ilike '%permission denied%');
select t.check('bad input is rejected (no @, empty name, short message)',
  t.errmsg($q$insert into contact_messages (name, email, message) values ('A', 'nope', 'long enough message')$q$) ilike '%check constraint%'
  and t.errmsg($q$insert into contact_messages (name, email, message) values ('  ', 'a@b.c', 'long enough message')$q$) ilike '%check constraint%'
  and t.errmsg($q$insert into contact_messages (name, email, message) values ('A', 'a@b.c', 'hey')$q$) ilike '%check constraint%');

:as_a
select t.check('a signed-in user can send but not read',
  t.rows($q$insert into contact_messages (name, email, message) values ('B', 'b@example.com', 'a real message')$q$) = 1
  and t.errmsg('select count(*) from contact_messages') ilike '%permission denied%');
select t.check('nobody can update or delete messages',
  t.errmsg($q$update contact_messages set name = 'x'$q$) ilike '%permission denied%' and t.errmsg('delete from contact_messages') ilike '%permission denied%');

:as_super
select t.check('both messages were stored', t.n('select count(*) from contact_messages') = 2);
\o
\set QUIET off
select 'ALL CONTACT CHECKS PASSED' as result;
