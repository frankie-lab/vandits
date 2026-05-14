-- Image recovery panel v2: separate Universe / Operation / Scope.
-- Adds 3 modes (missing / refresh / full) and geo filters (continent / country / zone)
-- across the breakdown, scope, users and locations RPCs.

-- Helper predicate by mode --------------------------------------------------
create or replace function public._image_recovery_predicate_by_mode(
  _loc public.locations,
  _mode text,
  _force boolean,
  _retry_stale_days integer
) returns boolean
language sql
stable
set search_path to 'public'
as $$
  select case
    when _loc.deleted_at is not null then false
    when _mode = 'missing' then
      public._image_recovery_candidate_predicate(_loc, _force, _retry_stale_days)
    when _mode = 'refresh' then
      _loc.enriched_data is not null
      and (
        _force
        or coalesce(nullif(_loc.enriched_data->'media'->>'image_recovery_attempted_at', ''), null) is null
        or (_loc.enriched_data->'media'->>'image_recovery_attempted_at')::timestamptz
           < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
      )
    when _mode = 'full' then true
    else false
  end;
$$;

-- Drop old signatures so we can extend with _mode + geo filters --------------
drop function if exists public.admin_image_recovery_users(boolean, integer);
drop function if exists public.admin_image_recovery_locations(uuid, boolean, integer, integer, integer);

-- Users RPC (extended) ------------------------------------------------------
create or replace function public.admin_image_recovery_users(
  _mode text default 'missing',
  _force boolean default false,
  _retry_stale_days integer default 30,
  _continent text default null,
  _country text default null,
  _zone text default null
) returns table (
  user_id uuid,
  username text,
  display_name text,
  universe_count bigint,
  total_locations bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'master')) then
    raise exception 'forbidden';
  end if;

  return query
  with candidates as (
    select l.owner_user_id
    from public.locations l
    where l.owner_user_id is not null
      and public._image_recovery_predicate_by_mode(l, _mode, _force, _retry_stale_days)
      and (_continent is null or l.continent ilike _continent)
      and (_country is null or l.country ilike _country)
      and (_zone is null or l.zone ilike _zone)
  ),
  totals as (
    select l.owner_user_id, count(*)::bigint as total
    from public.locations l
    where l.deleted_at is null and l.owner_user_id is not null
    group by l.owner_user_id
  ),
  agg as (
    select c.owner_user_id, count(*)::bigint as cnt
    from candidates c
    group by c.owner_user_id
  )
  select
    a.owner_user_id as user_id,
    p.username,
    p.display_name,
    a.cnt as universe_count,
    coalesce(t.total, 0) as total_locations
  from agg a
  left join public.profiles p on p.id = a.owner_user_id
  left join totals t on t.owner_user_id = a.owner_user_id
  order by a.cnt desc, p.display_name nulls last;
end;
$$;

-- Locations RPC (extended) --------------------------------------------------
create or replace function public.admin_image_recovery_locations(
  _user_id uuid,
  _mode text default 'missing',
  _force boolean default false,
  _retry_stale_days integer default 30,
  _continent text default null,
  _country text default null,
  _zone text default null,
  _limit integer default 1000,
  _offset integer default 0
) returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  continent text,
  country text,
  region text,
  zone text,
  admin_level_3 text,
  locality text,
  sublocality text,
  place_type text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'master')) then
    raise exception 'forbidden';
  end if;

  return query
  select
    l.id,
    l.name,
    l.latitude,
    l.longitude,
    l.continent,
    l.country,
    l.region,
    l.zone,
    (l.enriched_data->'datos_geograficos'->>'admin_nivel_3')::text as admin_level_3,
    (l.enriched_data->'datos_geograficos'->>'localidad')::text as locality,
    (l.enriched_data->'datos_geograficos'->>'sublocalidad')::text as sublocality,
    l.place_type
  from public.locations l
  where l.owner_user_id = _user_id
    and public._image_recovery_predicate_by_mode(l, _mode, _force, _retry_stale_days)
    and (_continent is null or l.continent ilike _continent)
    and (_country is null or l.country ilike _country)
    and (_zone is null or l.zone ilike _zone)
  order by l.id asc
  limit greatest(_limit, 1)
  offset greatest(_offset, 0);
end;
$$;

-- Scope counter (subset operativo) ------------------------------------------
create or replace function public.admin_image_recovery_scope(
  _mode text default 'missing',
  _user_id uuid default null,
  _continent text default null,
  _country text default null,
  _zone text default null,
  _force boolean default false,
  _retry_stale_days integer default 30
) returns bigint
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_count bigint;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'master')) then
    raise exception 'forbidden';
  end if;

  select count(*)::bigint into v_count
  from public.locations l
  where (_user_id is null or l.owner_user_id = _user_id)
    and public._image_recovery_predicate_by_mode(l, _mode, _force, _retry_stale_days)
    and (_continent is null or l.continent ilike _continent)
    and (_country is null or l.country ilike _country)
    and (_zone is null or l.zone ilike _zone);

  return coalesce(v_count, 0);
end;
$$;
