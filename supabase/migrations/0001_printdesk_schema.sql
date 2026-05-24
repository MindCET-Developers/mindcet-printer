-- PrintDesk Phase 1 schema
-- Run in Supabase SQL editor or through the Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_name text not null,
  user_email text,
  user_phone text,
  room_or_company text,

  file_name text not null,
  file_path text not null,
  file_size_bytes bigint,
  file_mime_type text not null,
  file_deleted boolean not null default false,
  file_deleted_at timestamptz,

  status text not null default 'pending',

  copies int not null default 1,
  color_mode text not null default 'bw',
  duplex_mode text not null default 'one_sided',

  page_count int,
  estimated_pages int,
  notes text,

  requires_manual_approval boolean not null default false,
  approved_by text,
  approved_at timestamptz,

  claimed_by_agent_id text,
  claimed_at timestamptz,

  printed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,

  error_message text,
  agent_log text,

  user_ip text,
  user_agent text,
  status_token text not null default encode(gen_random_bytes(32), 'hex'),

  constraint print_jobs_status_check check (
    status in (
      'pending',
      'approved',
      'claimed',
      'downloading',
      'printing',
      'printed',
      'failed',
      'cancelled',
      'rejected'
    )
  ),
  constraint print_jobs_color_mode_check check (color_mode in ('bw', 'color')),
  constraint print_jobs_duplex_mode_check check (
    duplex_mode in (
      'one_sided',
      'two_sided_long_edge',
      'two_sided_short_edge'
    )
  ),
  constraint print_jobs_copies_check check (copies between 1 and 5),
  constraint print_jobs_pdf_only_check check (file_mime_type = 'application/pdf'),
  constraint print_jobs_status_token_unique unique (status_token)
);

create table if not exists public.print_agents (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  status text not null default 'offline',
  printer_name text,
  machine_name text,
  agent_version text,
  current_job_id uuid references public.print_jobs(id) on delete set null,
  last_error text,
  constraint print_agents_status_check check (
    status in ('offline', 'online', 'printing', 'error')
  )
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
select key, value
from (
  values
    ('printing_enabled', 'true'::jsonb),
    ('public_upload_enabled', 'true'::jsonb),
    ('manual_approval_required', 'true'::jsonb),
    ('max_file_size_mb', '20'::jsonb),
    ('max_page_count', '50'::jsonb),
    ('allowed_file_types', '["application/pdf"]'::jsonb),
    ('upload_passcode_enabled', 'false'::jsonb),
    ('upload_passcode_hash', 'null'::jsonb)
) as initial_settings(key, value)
on conflict (key) do nothing;

create index if not exists print_jobs_status_created_at_idx
  on public.print_jobs (status, created_at);

create index if not exists print_jobs_status_token_idx
  on public.print_jobs (id, status_token);

create index if not exists print_jobs_claimed_by_agent_idx
  on public.print_jobs (claimed_by_agent_id, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists print_jobs_touch_updated_at on public.print_jobs;
create trigger print_jobs_touch_updated_at
before update on public.print_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists print_agents_touch_updated_at on public.print_agents;
create trigger print_agents_touch_updated_at
before update on public.print_agents
for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin';
$$;

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
    case
      when j.status = 'failed' then j.error_message
      else null
    end as error_message
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

  update public.print_agents
  set
    last_seen_at = now(),
    status = 'online',
    last_error = null
  where id = p_agent_id;

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
    set
      status = 'printing',
      current_job_id = claimed_job.id,
      last_seen_at = now()
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
    and status in ('claimed', 'downloading', 'printing', 'failed')
  returning * into updated_job;

  if updated_job.id is null then
    raise exception 'Job % is not claimed by agent % or cannot be updated', p_job_id, p_agent_id;
  end if;

  update public.print_agents
  set
    last_seen_at = now(),
    status = case when p_new_status = 'failed' then 'error' else 'online' end,
    current_job_id = case when p_new_status in ('printed', 'failed') then null else p_job_id end,
    last_error = case when p_new_status = 'failed' then p_error_message else null end
  where id = p_agent_id;

  return updated_job;
end;
$$;

alter table public.print_jobs enable row level security;
alter table public.print_agents enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.print_jobs from anon, authenticated;
revoke all on public.print_agents from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

grant insert (
  user_name,
  user_email,
  user_phone,
  room_or_company,
  file_name,
  file_path,
  file_size_bytes,
  file_mime_type,
  status,
  copies,
  color_mode,
  duplex_mode,
  page_count,
  estimated_pages,
  notes,
  requires_manual_approval,
  user_ip,
  user_agent
) on public.print_jobs to anon;

grant select, update, delete on public.print_jobs to authenticated;
grant select on public.print_agents to authenticated;
grant select, update on public.app_settings to authenticated;
grant execute on function public.get_public_job_status(uuid, text) to anon, authenticated;
revoke execute on function public.claim_next_print_job(text) from anon, authenticated;
revoke execute on function public.update_job_status(uuid, text, text, text, text) from anon, authenticated;

drop policy if exists "Public can create limited print jobs" on public.print_jobs;
create policy "Public can create limited print jobs"
on public.print_jobs
for insert
to anon
with check (
  public.get_setting_bool('public_upload_enabled', true)
  and user_name is not null
  and file_name is not null
  and file_path is not null
  and file_mime_type = 'application/pdf'
  and copies between 1 and 5
  and status in ('pending', 'approved')
  and claimed_by_agent_id is null
  and approved_by is null
  and printed_at is null
  and failed_at is null
  and cancelled_at is null
);

drop policy if exists "Admins can read print jobs" on public.print_jobs;
create policy "Admins can read print jobs"
on public.print_jobs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update print jobs" on public.print_jobs;
create policy "Admins can update print jobs"
on public.print_jobs
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete print jobs" on public.print_jobs;
create policy "Admins can delete print jobs"
on public.print_jobs
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read print agents" on public.print_agents;
create policy "Admins can read print agents"
on public.print_agents
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage app settings" on public.app_settings;
create policy "Admins can manage app settings"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Admins can read print files" on storage.objects;
create policy "Admins can read print files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'print-files'
  and public.is_admin()
);

comment on table public.print_jobs is 'PrintDesk print jobs. Public reads must go through get_public_job_status(job_id, status_token) or server API.';
comment on function public.claim_next_print_job(text) is 'Atomically claims the oldest approved print job for one local print agent.';
comment on function public.update_job_status(uuid, text, text, text, text) is 'Allows a service-role print agent to update only jobs it claimed.';
