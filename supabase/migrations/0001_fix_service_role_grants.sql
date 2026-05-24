-- PrintDesk permission fix.
-- Run this if the app says tables are missing but Supabase returns:
-- permission denied for table print_jobs

grant usage on schema public to service_role;

grant all privileges on table public.print_jobs to service_role;
grant all privileges on table public.print_agents to service_role;
grant all privileges on table public.app_settings to service_role;

grant all privileges on table public.print_jobs to postgres;
grant all privileges on table public.print_agents to postgres;
grant all privileges on table public.app_settings to postgres;

notify pgrst, 'reload schema';
