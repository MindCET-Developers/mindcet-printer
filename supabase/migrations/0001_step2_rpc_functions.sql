-- PrintDesk Step 2: RPC functions.
-- Run this only after Step 1 succeeds.

create or replace function public.get_setting_bool(setting_key text, fallback boolean)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (value #>> '{}')::boolean from public.app_settings where key = setting_key),
    fallback
  );
$$;

create or replace function public.get_public_job_status(
  p_job_id uuid,
  p_status_token text
)
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  file_name text,
  status text,
  copies int,
  color_mode text,
  duplex_mode text,
  page_count int,
  estimated_pages int,
  error_message text
)
language sql
security definer
set search_path = public
as $$
  select
    j.id,
    j.created_at,
    j.updated_at,
    j.file_name,
    j.status,
    j.copies,
    j.color_mode,
    j.duplex_mode,
    j.page_count,
    j.estimated_pages,
    case when j.status = 'failed' then j.error_message else null end
  from public.print_jobs j
  where j.id = p_job_id
    and j.status_token = p_status_token;
$$;

create or replace function public.claim_next_print_job(p_agent_id text)
returns setof public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job public.print_jobs;
begin
  if not public.get_setting_bool('printing_enabled', true) then
    return;
  end if;

  insert into public.print_agents (id, last_seen_at, status)
  values (p_agent_id, now(), 'online')
  on conflict (id) do update set last_seen_at = now(), status = 'online', updated_at = now();

  with next_job as (
    select id
    from public.print_jobs
    where status = 'approved'
      and file_deleted = false
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.print_jobs j
  set
    status = 'claimed',
    claimed_by_agent_id = p_agent_id,
    claimed_at = now(),
    error_message = null,
    agent_log = null
  from next_job
  where j.id = next_job.id
  returning j.* into claimed_job;

  if claimed_job.id is not null then
    update public.print_agents
    set status = 'printing', current_job_id = claimed_job.id, last_seen_at = now(), updated_at = now()
    where id = p_agent_id;

    return next claimed_job;
  end if;
end;
$$;

create or replace function public.update_job_status(
  p_job_id uuid,
  p_agent_id text,
  p_new_status text,
  p_error_message text default null,
  p_agent_log text default null
)
returns public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_job public.print_jobs;
begin
  if p_new_status not in ('claimed', 'downloading', 'printing', 'printed', 'failed') then
    raise exception 'Unsupported agent status transition: %', p_new_status;
  end if;

  update public.print_jobs
  set
    status = p_new_status,
    error_message = p_error_message,
    agent_log = p_agent_log,
    printed_at = case when p_new_status = 'printed' then now() else printed_at end,
    failed_at = case when p_new_status = 'failed' then now() else failed_at end
  where id = p_job_id
    and claimed_by_agent_id = p_agent_id
  returning * into updated_job;

  if updated_job.id is null then
    raise exception 'Job % is not claimed by agent %', p_job_id, p_agent_id;
  end if;

  update public.print_agents
  set
    last_seen_at = now(),
    status = case when p_new_status = 'failed' then 'error' else 'online' end,
    current_job_id = case when p_new_status in ('printed', 'failed') then null else p_job_id end,
    last_error = case when p_new_status = 'failed' then p_error_message else null end,
    updated_at = now()
  where id = p_agent_id;

  return updated_job;
end;
$$;
