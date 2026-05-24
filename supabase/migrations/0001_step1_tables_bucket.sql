-- PrintDesk Step 1: tables, settings, storage bucket.
-- Run this first in Supabase SQL Editor.

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
  file_mime_type text not null default 'application/pdf',
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
    status in ('pending', 'approved', 'claimed', 'downloading', 'printing', 'printed', 'failed', 'cancelled', 'rejected')
  ),
  constraint print_jobs_color_mode_check check (color_mode in ('bw', 'color')),
  constraint print_jobs_duplex_mode_check check (
    duplex_mode in ('one_sided', 'two_sided_long_edge', 'two_sided_short_edge')
  ),
  constraint print_jobs_copies_check check (copies between 1 and 5),
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
  last_error text
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('printing_enabled', 'true'::jsonb),
  ('public_upload_enabled', 'true'::jsonb),
  ('manual_approval_required', 'true'::jsonb),
  ('max_file_size_mb', '20'::jsonb),
  ('max_page_count', '50'::jsonb),
  ('allowed_file_types', '["application/pdf"]'::jsonb),
  ('upload_passcode_enabled', 'false'::jsonb),
  ('upload_passcode_hash', 'null'::jsonb)
on conflict (key) do nothing;

create index if not exists print_jobs_status_created_at_idx on public.print_jobs (status, created_at);
create index if not exists print_jobs_status_token_idx on public.print_jobs (id, status_token);
create index if not exists print_jobs_claimed_by_agent_idx on public.print_jobs (claimed_by_agent_id, status);

alter table public.print_jobs enable row level security;
alter table public.print_agents enable row level security;
alter table public.app_settings enable row level security;

insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', false)
on conflict (id) do update set public = false;

grant usage on schema public to service_role;
grant all privileges on table public.print_jobs to service_role;
grant all privileges on table public.print_agents to service_role;
grant all privileges on table public.app_settings to service_role;

notify pgrst, 'reload schema';
