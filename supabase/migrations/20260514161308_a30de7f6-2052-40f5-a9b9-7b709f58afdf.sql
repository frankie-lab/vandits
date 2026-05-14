-- ============================================================
-- Image recovery predicate v2: considers ALL image sources
-- ============================================================
-- Old predicate looked only at enriched_data.imagen / media.cover_url.
-- Reality: a POI may have a photo from any of:
--   1) enriched_data.imagen          (AI/scrape)
--   2) locations.user_image_url      (user-uploaded URL)
--   3) location_photos table         (gallery uploads)
-- Missing #2 and #3 caused inflated "sin imagen" counts.

-- Drop old jsonb-based predicate (no other callers).
drop function if exists public._image_recovery_candidate_predicate(jsonb, boolean, integer);

-- New predicate: takes the full locations row.
create or replace function public._image_recovery_candidate_predicate(
  _loc public.locations,
  _force boolean,
  _retry_stale_days integer
) returns boolean
language sql
stable
set search_path to 'public'
as $$
  select
    _loc.deleted_at is null
    and _loc.enriched_data is not null
    -- no image in ANY of the 3 sources
    and coalesce(nullif(_loc.enriched_data->>'imagen', ''), null) is null
    and coalesce(nullif(_loc.enriched_data->'media'->>'cover_url', ''), null) is null
    and coalesce(nullif(_loc.user_image_url, ''), null) is null
    and not exists (
      select 1 from public.location_photos lp where lp.location_id = _loc.id
    )
    -- cooldown
    and (
      _force
      or coalesce(nullif(_loc.enriched_data->'media'->>'image_recovery_attempted_at', ''), null) is null
      or (_loc.enriched_data->'media'->>'image_recovery_attempted_at')::timestamptz
         < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
    );
$$;

-- ------------------------------------------------------------
-- Update admin_image_recovery_users to use the row-based predicate
-- ------------------------------------------------------------
create or replace function public.admin_image_recovery_users(
  _force boolean default false,
  _retry_stale_days integer default 30
)
returns table(
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
      and public._image_recovery_candidate_predicate(l, _force, _retry_stale_days)
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

-- ------------------------------------------------------------
-- Update admin_image_recovery_locations to use the row-based predicate
-- ------------------------------------------------------------
create or replace function public.admin_image_recovery_locations(
  _user_id uuid,
  _force boolean default false,
  _retry_stale_days integer default 30,
  _limit integer default 1000,
  _offset integer default 0
)
returns table(
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
    and public._image_recovery_candidate_predicate(l, _force, _retry_stale_days)
  order by l.id asc
  limit greatest(_limit, 1)
  offset greatest(_offset, 0);
end;
$$;

-- ------------------------------------------------------------
-- New: full breakdown for the "Universe" UI card
-- ------------------------------------------------------------
create or replace function public.admin_image_recovery_breakdown(
  _retry_stale_days integer default 30
)
returns table(
  total_active bigint,
  enriched bigint,
  not_enriched bigint,
  with_image_any bigint,
  image_from_enriched bigint,
  image_from_user_url bigint,
  image_from_photos_table bigint,
  enriched_without_image bigint,
  pending_candidates bigint,
  in_cooldown bigint
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
  with base as (
    select
      l.id,
      l.enriched_data,
      l.user_image_url,
      coalesce(nullif(l.enriched_data->>'imagen', ''), nullif(l.enriched_data->'media'->>'cover_url','')) is not null as has_enriched_img,
      coalesce(nullif(l.user_image_url, ''), null) is not null as has_user_img,
      exists (select 1 from public.location_photos lp where lp.location_id = l.id) as has_photos_row,
      l.enriched_data is not null as is_enriched,
      public._image_recovery_candidate_predicate(l, false, _retry_stale_days) as is_pending,
      public._image_recovery_candidate_predicate(l, true,  _retry_stale_days) as is_force_universe
    from public.locations l
    where l.deleted_at is null
  )
  select
    count(*)::bigint                                                          as total_active,
    count(*) filter (where is_enriched)::bigint                               as enriched,
    count(*) filter (where not is_enriched)::bigint                           as not_enriched,
    count(*) filter (where has_enriched_img or has_user_img or has_photos_row)::bigint as with_image_any,
    count(*) filter (where has_enriched_img)::bigint                          as image_from_enriched,
    count(*) filter (where has_user_img and not has_enriched_img)::bigint     as image_from_user_url,
    count(*) filter (where has_photos_row and not has_enriched_img and not has_user_img)::bigint as image_from_photos_table,
    count(*) filter (where is_enriched and not has_enriched_img and not has_user_img and not has_photos_row)::bigint as enriched_without_image,
    count(*) filter (where is_pending)::bigint                                as pending_candidates,
    count(*) filter (where is_force_universe and not is_pending)::bigint      as in_cooldown
  from base;
end;
$$;