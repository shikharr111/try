-- =====================================================================
-- Transactional RPCs used by the application   (verified by supabase/tests/20_rpc_tests.sql)
-- SECURITY INVOKER unless stated: RLS and integrity triggers apply to the caller.
-- =====================================================================

-- Saves a whole daily report (header + activity lines + workforce + equipment) atomically.
-- p_report_id null  => create (reporter = caller); otherwise replace the content of that report.
-- p_header : {report_date, shift, weather, site_conditions, observations}
-- p_lines  : [{activity_id, planned_workers, actual_workers, planned_qty, actual_qty, material_available,
--              material_notes, material_consumed_qty, material_unit, observations}]
-- p_workforce: [{activity_id?, trade, planned_workers, actual_workers, hours_worked}]
-- p_equipment: [{activity_id?, machine_type, machine_count, planned_hours, operating_hours, downtime_hours, downtime_reason}]
-- The unit of every line is taken from the activity, so a reported unit can never disagree with the plan.
create or replace function public.save_daily_report(
  p_project uuid, p_report_id uuid, p_header jsonb, p_lines jsonb,
  p_workforce jsonb default '[]'::jsonb, p_equipment jsonb default '[]'::jsonb, p_submit boolean default false
) returns uuid language plpgsql as $$
declare
  v_id uuid; v_date date; v_shift text; v_tz text; v_today date; v_status public.report_status; r jsonb; v_unit text; v_n int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_report_project(p_project) then raise exception 'Not allowed to report on this project'; end if;

  v_shift := coalesce(nullif(p_header ->> 'shift', ''), 'day');
  if v_shift not in ('day', 'night') then raise exception 'Shift must be day or night'; end if;

  if p_report_id is null then
    v_date := (p_header ->> 'report_date')::date;
    if v_date is null then raise exception 'Report date is required'; end if;
    select timezone into v_tz from public.projects where id = p_project;
    v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
    if v_date > v_today then raise exception 'Report date % is in the future', v_date; end if;
    begin
      insert into public.daily_reports (project_id, report_date, shift, reporter_id, status, weather, site_conditions, observations)
      values (p_project, v_date, v_shift, auth.uid(), 'draft', nullif(p_header ->> 'weather', ''),
              nullif(p_header ->> 'site_conditions', ''), nullif(p_header ->> 'observations', ''))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'You already have a report for % (% shift) on this project; open and edit it instead', v_date, v_shift;
    end;
  else
    select id, status into v_id, v_status from public.daily_reports where id = p_report_id and project_id = p_project;
    if v_id is null then raise exception 'Report not found'; end if;
    if v_status = 'approved' then raise exception 'Approved reports are locked; a manager must reopen (reject) the report first'; end if;
    -- report_date/shift are the report's identity and are not editable here
    update public.daily_reports
       set weather = nullif(p_header ->> 'weather', ''),
           site_conditions = nullif(p_header ->> 'site_conditions', ''),
           observations = nullif(p_header ->> 'observations', '')
     where id = v_id and project_id = p_project;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'You are not allowed to edit this report'; end if;
    delete from public.daily_report_lines where report_id = v_id;
    delete from public.workforce_records where report_id = v_id;
    delete from public.equipment_records where report_id = v_id;
  end if;

  select report_date, shift into v_date, v_shift from public.daily_reports where id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select unit into v_unit from public.activities where id = (r ->> 'activity_id')::uuid and project_id = p_project;
    if v_unit is null then raise exception 'Unknown activity in report line'; end if;
    insert into public.daily_report_lines (report_id, project_id, report_date, shift, activity_id, planned_workers, actual_workers,
                                           planned_qty, actual_qty, unit, material_available, material_notes,
                                           material_consumed_qty, material_unit, observations)
    values (v_id, p_project, v_date, v_shift, (r ->> 'activity_id')::uuid,
            nullif(r ->> 'planned_workers', '')::numeric, nullif(r ->> 'actual_workers', '')::numeric,
            nullif(r ->> 'planned_qty', '')::numeric, coalesce(nullif(r ->> 'actual_qty', '')::numeric, 0), v_unit,
            nullif(r ->> 'material_available', '')::boolean, nullif(r ->> 'material_notes', ''),
            nullif(r ->> 'material_consumed_qty', '')::numeric, nullif(r ->> 'material_unit', ''), nullif(r ->> 'observations', ''));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_workforce, '[]'::jsonb)) loop
    insert into public.workforce_records (report_id, project_id, report_date, activity_id, trade, planned_workers, actual_workers, hours_worked)
    values (v_id, p_project, v_date, nullif(r ->> 'activity_id', '')::uuid, r ->> 'trade',
            coalesce(nullif(r ->> 'planned_workers', '')::numeric, 0), coalesce(nullif(r ->> 'actual_workers', '')::numeric, 0),
            nullif(r ->> 'hours_worked', '')::numeric);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) loop
    insert into public.equipment_records (report_id, project_id, report_date, activity_id, machine_type, machine_count, planned_hours,
                                          operating_hours, downtime_hours, downtime_reason)
    values (v_id, p_project, v_date, nullif(r ->> 'activity_id', '')::uuid, r ->> 'machine_type',
            coalesce(nullif(r ->> 'machine_count', '')::int, 1), coalesce(nullif(r ->> 'planned_hours', '')::numeric, 0),
            coalesce(nullif(r ->> 'operating_hours', '')::numeric, 0), coalesce(nullif(r ->> 'downtime_hours', '')::numeric, 0),
            nullif(r ->> 'downtime_reason', ''));
  end loop;

  if p_submit then
    update public.daily_reports set status = 'submitted' where id = v_id and status in ('draft', 'rejected');
  end if;
  return v_id;
end $$;

-- Org admins add an already-registered user to their organization by exact e-mail match.
-- SECURITY DEFINER because profiles of users who share no organization yet are (rightly) invisible to RLS.
-- Trade-off (documented): an org admin can learn whether an exact e-mail address has an account.
create or replace function public.add_org_member_by_email(p_org uuid, p_email text, p_role public.org_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_org_admin(p_org) then raise exception 'Only organization admins can add members'; end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No registered user with that e-mail. Ask them to sign up first.'; end if;
  insert into public.organization_memberships (organization_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.save_daily_report(uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.add_org_member_by_email(uuid, text, public.org_role) from public, anon;
grant execute on function public.save_daily_report(uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.add_org_member_by_email(uuid, text, public.org_role) to authenticated;
