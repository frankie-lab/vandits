create table if not exists public.design_system_history (
  id uuid primary key default gen_random_uuid(),
  value jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  note text
);

alter table public.design_system_history enable row level security;

drop policy if exists "DS history readable by all" on public.design_system_history;
create policy "DS history readable by all"
  on public.design_system_history for select
  to authenticated using (true);

drop policy if exists "DS history writable by admin" on public.design_system_history;
create policy "DS history writable by admin"
  on public.design_system_history for insert
  to authenticated
  with check (public._is_admin_or_master(auth.uid()));

insert into public.app_settings (key, value, description)
values ('design_system_overrides', '{}'::jsonb, 'Live overrides for design tokens (Nivel 2 editor).')
on conflict (key) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.app_settings;
  exception when others then null;
  end;
end$$;