-- Members of the caller's own organizations, for pickers (project assignment).
-- security_invoker: organization_memberships / profiles RLS applies to the caller. E-mail is only shown to
-- organization admins. (Adding members by e-mail lives in 20261023000005_report_and_member_rpcs.sql.)
create or replace view public.v_org_members with (security_invoker = true) as
select m.organization_id, m.user_id, m.role, p.full_name,
       case when public.is_org_admin(m.organization_id) then p.email else null end as email
from public.organization_memberships m
join public.profiles p on p.id = m.user_id;
grant select on public.v_org_members to authenticated;
