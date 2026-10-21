begin;
drop trigger if exists steps_set_organization on public.steps;
drop trigger if exists defect_logs_set_organization on public.defect_logs;
drop function if exists public.set_organization_from_study();
commit;
