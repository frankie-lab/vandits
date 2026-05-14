-- ============================================================
-- Image Recovery admin RPCs — mirror of admin_user_geo_* used by
-- GeographyBackfillPanel, so RecoverImagesPanel can share the same
-- 3-zone UI (mode cards / users / scope tree / launch).
--
-- Candidate definition (matches recover-missing-images edge function):
--   - locations.deleted_at IS NULL
--   - enriched_data IS NOT NULL
--   - enriched_data->>'imagen' is null/empty
--     AND enriched_data->'media'->>'cover_url' is null/empty
--   - if NOT _force: enriched_data->'media'->>'image_recovery_attempted_at'
--     is null OR older than _retry_stale_days
-- ============================================================

create or replace function public._image_recovery_candidate_predicate(
  _enriched jsonb,
  _force boolean,
  _retry_stale_days int
) returns boolean
language sql
immutable
as $$
  select
    _enriched is not null
    and coalesce(nullif(_enriched->>'imagen', ''), null) is null
    and coalesce(nullif(_enriched->'media'->>'cover_url', ''), null) is null
    and (
      _force
      or coalesce(nullif(_enriched->'media'->>'image_recovery_attempted_at', ''), null) is null
      or (
        (_enriched->'media'->>'image_recovery_attempted_at')::timestamptz
          < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
      )
    );
$$;

create or replace function public.admin_image_recovery_users(
  _force boolean default false,
  _retry_stale_days int default 30
) returns table(
  user_id uuid,
  username text,
  display_name text,
  universe_count bigint,
  total_locations bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'master')) then
    raise exception 'forbidden';
  end if;

  return query
  with candidates as (
    select l.owner_user_id, l.id
    from public.locations l
    where l.deleted_at is null
      and l.owner_user_id is not null
      and public._image_recovery_candidate_predicate(l.enriched_data, _force, _retry_stale_days)
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

create or replace function public.admin_image_recovery_locations(
  _user_id uuid,
  _force boolean default false,
  _retry_stale_days int default 30,
  _limit int default 1000,
  _offset int default 0
) returns table(
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
set search_path = public
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
  where l.deleted_at is null
    and l.owner_user_id = _user_id
    and public._image_recovery_candidate_predicate(l.enriched_data, _force, _retry_stale_days)
  order by l.id asc
  limit greatest(_limit, 1)
  offset greatest(_offset, 0);
end;
$$;

grant execute on function public.admin_image_recovery_users(boolean, int) to authenticated;
grant execute on function public.admin_image_recovery_locations(uuid, boolean, int, int, int) to authenticated;