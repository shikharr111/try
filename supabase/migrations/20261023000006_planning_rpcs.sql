-- =====================================================================
-- Baseline revision workflow RPCs   (verified by supabase/tests/30_plan_tests.sql)
-- SECURITY INVOKER: RLS and the immutability triggers apply to the caller.
-- =====================================================================

-- Opens a new DRAFT revision. When an approved revision exists, its activities, dependencies and daily
-- plans are copied so the manager edits a full schedule. The approved revision itself is never touched.
create or replace function public.create_baseline_draft(p_project uuid, p_reason text default null)
returns uuid language plpgsql as $$
declare v_new uuid; v_src uuid;
begin
  if not public.can_manage_project(p_project) then raise exception 'Only a project manager or organization admin can revise the baseline'; end if;
  if exists (select 1 from public.baseline_revisions where project_id = p_project and status = 'draft') then
    raise exception 'A draft revision already exists; approve or discard it first';
  end if;
  select id into v_src from public.baseline_revisions where project_id = p_project and status = 'approved';
  insert into public.baseline_revisions (project_id, revision_no, name, reason, created_by)
  values (p_project, 0, case when v_src is null then 'Initial baseline' else 'Revision' end, nullif(trim(p_reason), ''), auth.uid())
  returning id into v_new;
  if v_src is not null then
    insert into public.baseline_activities (revision_id, project_id, activity_id, planned_start, planned_finish, total_qty,
                                            planned_workers, planned_machine_hours, distribution)
    select v_new, project_id, activity_id, planned_start, planned_finish, total_qty, planned_workers, planned_machine_hours, distribution
    from public.baseline_activities where revision_id = v_src;
    insert into public.activity_dependencies (revision_id, project_id, predecessor_id, successor_id, dependency_type, lag_working_days)
    select v_new, project_id, predecessor_id, successor_id, dependency_type, lag_working_days
    from public.activity_dependencies where revision_id = v_src;
    insert into public.daily_plans (revision_id, project_id, activity_id, plan_date, planned_qty, planned_workers, planned_machine_hours)
    select v_new, project_id, activity_id, plan_date, planned_qty, planned_workers, planned_machine_hours
    from public.daily_plans where revision_id = v_src;
  end if;
  return v_new;
end $$;

-- Discards a DRAFT revision and any activity that was created only for it (no other revision, no reports).
create or replace function public.discard_baseline_draft(p_revision uuid) returns void
language plpgsql as $$
declare v_project uuid; v_status public.baseline_status;
begin
  select project_id, status into v_project, v_status from public.baseline_revisions where id = p_revision;
  if v_project is null then raise exception 'Revision not found'; end if;
  if v_status <> 'draft' then raise exception 'Only a draft revision can be discarded'; end if;
  if not public.can_manage_project(v_project) then raise exception 'Not allowed'; end if;
  delete from public.baseline_revisions where id = p_revision;
  delete from public.activities a
   where a.project_id = v_project
     and not exists (select 1 from public.baseline_activities b where b.activity_id = a.id)
     and not exists (select 1 from public.daily_report_lines l where l.activity_id = a.id)
     and not exists (select 1 from public.delay_events d where d.activity_id = a.id);
end $$;

-- Replaces an activity's explicit daily targets in a DRAFT revision. p_rows = [{plan_date, planned_qty}].
-- The targets must lie inside the activity's planned span and add up EXACTLY to its total quantity.
-- An empty array reverts the activity to the linear distribution.
create or replace function public.set_daily_plan(p_revision uuid, p_activity uuid, p_rows jsonb)
returns void language plpgsql as $$
declare v_project uuid; v_status public.baseline_status; v_start date; v_finish date; v_total numeric; v_sum numeric; r jsonb; v_n int;
begin
  select project_id, status into v_project, v_status from public.baseline_revisions where id = p_revision;
  if v_project is null then raise exception 'Revision not found'; end if;
  if v_status <> 'draft' then raise exception 'Daily targets can only be edited in a draft revision'; end if;
  if not public.can_manage_project(v_project) then raise exception 'Not allowed'; end if;
  select planned_start, planned_finish, total_qty into v_start, v_finish, v_total
    from public.baseline_activities where revision_id = p_revision and activity_id = p_activity;
  if v_start is null then raise exception 'Activity is not part of this revision'; end if;

  delete from public.daily_plans where revision_id = p_revision and activity_id = p_activity;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n = 0 then
    update public.baseline_activities set distribution = 'linear' where revision_id = p_revision and activity_id = p_activity;
    return;
  end if;
  v_sum := 0;
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r ->> 'plan_date')::date < v_start or (r ->> 'plan_date')::date > v_finish then
      raise exception 'Target date % is outside the activity''s planned span (% to %)', r ->> 'plan_date', v_start, v_finish;
    end if;
    insert into public.daily_plans (revision_id, project_id, activity_id, plan_date, planned_qty)
    values (p_revision, v_project, p_activity, (r ->> 'plan_date')::date, (r ->> 'planned_qty')::numeric);
    v_sum := v_sum + (r ->> 'planned_qty')::numeric;
  end loop;
  if v_sum <> v_total then
    raise exception 'Daily targets add up to % but the activity total is %', v_sum, v_total;
  end if;
  update public.baseline_activities set distribution = 'custom' where revision_id = p_revision and activity_id = p_activity;
end $$;

revoke all on function public.create_baseline_draft(uuid, text) from public, anon;
revoke all on function public.discard_baseline_draft(uuid) from public, anon;
revoke all on function public.set_daily_plan(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_baseline_draft(uuid, text) to authenticated;
grant execute on function public.discard_baseline_draft(uuid) to authenticated;
grant execute on function public.set_daily_plan(uuid, uuid, jsonb) to authenticated;
