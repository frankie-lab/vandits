create table public.user_owner_color_assignments (
  viewer_user_id   uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  color_index      smallint not null check (color_index >= 0),
  palette_version  text not null default 'owner-v1',
  assigned_at      timestamptz not null default now(),
  primary key (viewer_user_id, followed_user_id)
);

alter table public.user_owner_color_assignments enable row level security;

create policy "viewer reads own"
  on public.user_owner_color_assignments
  for select using (auth.uid() = viewer_user_id);

create policy "viewer inserts own"
  on public.user_owner_color_assignments
  for insert with check (auth.uid() = viewer_user_id);

create policy "viewer updates own"
  on public.user_owner_color_assignments
  for update using (auth.uid() = viewer_user_id)
  with check (auth.uid() = viewer_user_id);

create policy "viewer deletes own"
  on public.user_owner_color_assignments
  for delete using (auth.uid() = viewer_user_id);

create index idx_owner_color_viewer
  on public.user_owner_color_assignments(viewer_user_id);