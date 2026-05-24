create table public.poi_p2_runner_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  run_id uuid,
  batch_size int,
  reason text,
  result jsonb,
  report_path text,
  created_at timestamptz not null default now()
);

alter table public.poi_p2_runner_audit enable row level security;

create policy "Masters read p2 runner audit"
  on public.poi_p2_runner_audit
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'master'::app_role));

create index idx_poi_p2_runner_audit_created_at
  on public.poi_p2_runner_audit (created_at desc);