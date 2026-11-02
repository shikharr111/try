-- =====================================================================
-- Storage policies + transaction-safe import RPCs   (UNVERIFIED: not executed in the build sandbox)
-- All RPCs are SECURITY INVOKER: RLS and the integrity triggers apply to the calling user.
-- A plpgsql function body is one transaction: any raised error rolls back the whole import.
-- =====================================================================

-- ---------- private bucket for report attachments ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 15 * 1024 * 1024)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Object path convention: <project_id>/<anything>. The first folder decides access.
create policy attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_project(public.safe_uuid((storage.foldername(name))[1])));
create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_report_project(public.safe_uuid((storage.foldername(name))[1])));
create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and (owner = auth.uid() or public.can_manage_project(public.safe_uuid((storage.foldername(name))[1]))));

-- ---------- import: activities + baseline rows into a DRAFT revision ----------
-- p_rows: [{code,name,unit,wbs_code,planned_start,planned_finish,total_qty,planned_workers,planned_machine_hours,weight}]
-- Never overwrites: existing activities are reused as-is; duplicate baseline rows raise.
create or replace function public.import_activities(p_project uuid, p_revision uuid, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_act uuid; v_wbs uuid; v_created int := 0; v_rows int := 0; v_status public.baseline_status; v_idx int := 0;
begin
  if not public.can_manage_project(p_project) then raise exception 'Not allowed to import into this project'; end if;
  select status into v_status from public.baseline_revisions where id = p_revision and project_id = p_project;
  if v_status is null then raise exception 'Baseline revision not found in this project'; end if;
  if v_status <> 'draft' then raise exception 'Imports only go into a draft revision; approved baselines are never overwritten'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_wbs := null;
      if nullif(r ->> 'wbs_code', '') is not null then
        select id into v_wbs from public.wbs_nodes where project_id = p_project and code = r ->> 'wbs_code';
        if v_wbs is null then
          insert into public.wbs_nodes (project_id, code, name) values (p_project, r ->> 'wbs_code', r ->> 'wbs_code') returning id into v_wbs;
        end if;
      end if;

      select id into v_act from public.activities where project_id = p_project and code = r ->> 'code';
      if v_act is null then
        insert into public.activities (project_id, wbs_node_id, code, name, unit, weight, created_by)
        values (p_project, v_wbs, r ->> 'code', r ->> 'name', r ->> 'unit', nullif(r ->> 'weight', '')::numeric, auth.uid())
        returning id into v_act;
        v_created := v_created + 1;
      elsif not exists (select 1 from public.activities where id = v_act and lower(unit) = lower(r ->> 'unit')) then
        raise exception 'Unit differs from the existing activity''s unit';
      end if;

      insert into public.baseline_activities (revision_id, project_id, activity_id, planned_start, planned_finish,
                                              total_qty, planned_workers, planned_machine_hours)
      values (p_revision, p_project, v_act, (r ->> 'planned_start')::date, (r ->> 'planned_finish')::date,
              (r ->> 'total_qty')::numeric, nullif(r ->> 'planned_workers', '')::numeric,
              nullif(r ->> 'planned_machine_hours', '')::numeric);
      v_rows := v_rows + 1;
    exception when others then
      raise exception 'Row %: % (%)', v_idx, sqlerrm, coalesce(r ->> 'code', '?');
    end;
  end loop;
  return jsonb_build_object('activities_created', v_created, 'baseline_rows', v_rows);
end $$;

-- p_rows: [{predecessor_code, successor_code, lag_working_days}]
create or replace function public.import_dependencies(p_project uuid, p_revision uuid, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_pred uuid; v_succ uuid; v_n int := 0; v_idx int := 0;
begin
  if not public.can_manage_project(p_project) then raise exception 'Not allowed to import into this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    select id into v_pred from public.activities where project_id = p_project and code = r ->> 'predecessor_code';
    select id into v_succ from public.activities where project_id = p_project and code = r ->> 'successor_code';
    if v_pred is null or v_succ is null then
      raise exception 'Row %: unknown activity code (% -> %)', v_idx, r ->> 'predecessor_code', r ->> 'successor_code';
    end if;
    begin
      insert into public.activity_dependencies (revision_id, project_id, predecessor_id, successor_id, lag_working_days)
      values (p_revision, p_project, v_pred, v_succ, coalesce(nullif(r ->> 'lag_working_days', '')::int, 0));
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('dependencies', v_n);
end $$;

-- p_rows: [{report_date, shift, activity_code, planned_workers, actual_workers, planned_qty, actual_qty, unit, observations}]
-- Creates/extends the caller's own report per (date, shift). Existing lines are never overwritten
-- (the unique constraint raises), and approved reports are locked by trigger.
create or replace function public.import_daily_reports(p_project uuid, p_rows jsonb, p_submit boolean default false)
returns jsonb language plpgsql as $$
declare r jsonb; v_report uuid; v_act uuid; v_unit text; v_lines int := 0; v_reports int := 0; v_idx int := 0;
        v_date date; v_shift text;
begin
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_date := (r ->> 'report_date')::date;
      v_shift := coalesce(nullif(r ->> 'shift', ''), 'day');
      select id, unit into v_act, v_unit from public.activities where project_id = p_project and code = r ->> 'activity_code';
      if v_act is null then raise exception 'unknown activity code %', r ->> 'activity_code'; end if;

      select id into v_report from public.daily_reports
       where project_id = p_project and report_date = v_date and shift = v_shift and reporter_id = auth.uid();
      if v_report is null then
        insert into public.daily_reports (project_id, report_date, shift, reporter_id, status)
        values (p_project, v_date, v_shift, auth.uid(), 'draft') returning id into v_report;
        v_reports := v_reports + 1;
      end if;

      insert into public.daily_report_lines (report_id, project_id, report_date, shift, activity_id, planned_workers,
                                             actual_workers, planned_qty, actual_qty, unit, observations)
      values (v_report, p_project, v_date, v_shift, v_act,
              nullif(r ->> 'planned_workers', '')::numeric, nullif(r ->> 'actual_workers', '')::numeric,
              nullif(r ->> 'planned_qty', '')::numeric, (r ->> 'actual_qty')::numeric,
              coalesce(nullif(r ->> 'unit', ''), v_unit), nullif(r ->> 'observations', ''));
      v_lines := v_lines + 1;
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
  end loop;
  if p_submit then
    update public.daily_reports set status = 'submitted'
     where project_id = p_project and reporter_id = auth.uid() and status = 'draft'
       and (report_date, shift) in (select (x ->> 'report_date')::date, coalesce(nullif(x ->> 'shift', ''), 'day')
                                    from jsonb_array_elements(p_rows) x);
  end if;
  return jsonb_build_object('reports_created', v_reports, 'lines', v_lines);
end $$;

-- p_kind 'workforce': [{report_date, shift, activity_code?, trade, planned_workers, actual_workers, hours_worked}]
-- p_kind 'equipment': [{report_date, shift, activity_code?, machine_type, machine_count, planned_hours, operating_hours, downtime_hours, downtime_reason}]
-- The matching daily report (date+shift) must already exist for the caller.
create or replace function public.import_resource_records(p_project uuid, p_kind text, p_rows jsonb)
returns jsonb language plpgsql as $$
declare r jsonb; v_report uuid; v_act uuid; v_n int := 0; v_idx int := 0; v_date date; v_shift text;
begin
  if p_kind not in ('workforce', 'equipment') then raise exception 'Unknown kind %', p_kind; end if;
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_date := (r ->> 'report_date')::date;
      v_shift := coalesce(nullif(r ->> 'shift', ''), 'day');
      select id into v_report from public.daily_reports
       where project_id = p_project and report_date = v_date and shift = v_shift and reporter_id = auth.uid();
      if v_report is null then raise exception 'no daily report of yours exists for % (%); import daily reports first', v_date, v_shift; end if;
      v_act := null;
      if nullif(r ->> 'activity_code', '') is not null then
        select id into v_act from public.activities where project_id = p_project and code = r ->> 'activity_code';
        if v_act is null then raise exception 'unknown activity code %', r ->> 'activity_code'; end if;
      end if;
      if p_kind = 'workforce' then
        insert into public.workforce_records (report_id, project_id, report_date, activity_id, trade, planned_workers, actual_workers, hours_worked)
        values (v_report, p_project, v_date, v_act, r ->> 'trade', coalesce(nullif(r ->> 'planned_workers', '')::numeric, 0),
                coalesce(nullif(r ->> 'actual_workers', '')::numeric, 0), nullif(r ->> 'hours_worked', '')::numeric);
      else
        insert into public.equipment_records (report_id, project_id, report_date, activity_id, machine_type, machine_count,
                                              planned_hours, operating_hours, downtime_hours, downtime_reason)
        values (v_report, p_project, v_date, v_act, r ->> 'machine_type', coalesce(nullif(r ->> 'machine_count', '')::int, 1),
                coalesce(nullif(r ->> 'planned_hours', '')::numeric, 0), coalesce(nullif(r ->> 'operating_hours', '')::numeric, 0),
                coalesce(nullif(r ->> 'downtime_hours', '')::numeric, 0), nullif(r ->> 'downtime_reason', ''));
      end if;
      v_n := v_n + 1;
    exception when others then
      raise exception 'Row %: %', v_idx, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('records', v_n);
end $$;

revoke all on function public.import_activities(uuid, uuid, jsonb) from public, anon;
revoke all on function public.import_dependencies(uuid, uuid, jsonb) from public, anon;
revoke all on function public.import_daily_reports(uuid, jsonb, boolean) from public, anon;
revoke all on function public.import_resource_records(uuid, text, jsonb) from public, anon;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.import_activities(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_dependencies(uuid, uuid, jsonb) to authenticated;
grant execute on function public.import_daily_reports(uuid, jsonb, boolean) to authenticated;
grant execute on function public.import_resource_records(uuid, text, jsonb) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
