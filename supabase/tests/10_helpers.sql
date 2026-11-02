-- Tiny assertion helpers for the SQL test files (TEST ONLY). Created in schema "t".
create schema if not exists t;
grant usage on schema t to authenticated, anon;

create or replace function t.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

-- back to the superuser connection (auth.uid() is NULL again)
create or replace function t.as_super() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

create or replace function t.eq(p_actual anyelement, p_expected anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- The statement must raise an error whose message matches p_pattern (case-insensitive regex).
create or replace function t.throws(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS: % [%]', p_msg, left(sqlerrm, 90);
      return;
    end if;
    raise exception 'FAIL: % (wrong error: %)', p_msg, sqlerrm;
  end;
  raise exception 'FAIL: % (no error raised)', p_msg;
end $$;

-- Rows touched by a DML statement (RLS-filtered updates/deletes report 0, not an error).
create or replace function t.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function t.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;

grant execute on all functions in schema t to authenticated, anon;

-- ids shared by the tests (fixed UUIDs defined in seed.sql)
create or replace function t.uid(p_who text) returns uuid language sql immutable as $$
  select case p_who
    when 'admin' then 'a0000000-0000-4000-8000-000000000001'::uuid
    when 'pm'    then 'a0000000-0000-4000-8000-000000000002'::uuid
    when 'eng1'  then 'a0000000-0000-4000-8000-000000000003'::uuid
    when 'eng2'  then 'a0000000-0000-4000-8000-000000000004'::uuid
    when 'out'   then 'a0000000-0000-4000-8000-000000000005'::uuid
  end
$$;
create or replace function t.proj(p_n int) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-00000000000' || p_n)::uuid
$$;
create or replace function t.act(p_project uuid, p_code text) returns uuid language sql stable security definer as $$
  select id from public.activities where project_id = p_project and code = p_code
$$;
grant execute on all functions in schema t to authenticated, anon;

-- ---- boolean / message helpers used by 10_rls_tests, 20_rpc_tests and 30_plan_tests ----
create or replace function t.check(p_name text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL - %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;

create or replace function t.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint; begin execute p_sql into v; return v; end $$;

-- true when the statement raises (optionally matching a message fragment) or changes zero rows
create or replace function t.blocked(p_sql text, p_msg text default null) returns boolean language plpgsql as $$
declare v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return v_rows = 0 and p_msg is null;
exception when others then
  return p_msg is null or sqlerrm ilike '%' || p_msg || '%';
end $$;

create or replace function t.errmsg(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;


grant execute on all functions in schema t to authenticated, anon;
