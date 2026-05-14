
-- Canonical "is enriched" = enriched_data->>'descripcion' is not empty
-- Fix: candidate predicate (used by 'missing' mode)
CREATE OR REPLACE FUNCTION public._image_recovery_candidate_predicate(_loc locations, _force boolean, _retry_stale_days integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    _loc.deleted_at is null
    and coalesce(nullif(_loc.enriched_data->>'descripcion', ''), null) is not null
    and coalesce(nullif(_loc.enriched_data->>'imagen', ''), null) is null
    and coalesce(nullif(_loc.enriched_data->'media'->>'cover_url', ''), null) is null
    and coalesce(nullif(_loc.user_image_url, ''), null) is null
    and not exists (
      select 1 from public.location_photos lp where lp.location_id = _loc.id
    )
    and (
      _force
      or coalesce(nullif(_loc.enriched_data->'media'->>'image_recovery_attempted_at', ''), null) is null
      or (_loc.enriched_data->'media'->>'image_recovery_attempted_at')::timestamptz
         < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
    );
$function$;

-- Fix: predicate by mode (refresh uses canonical enriched check)
CREATE OR REPLACE FUNCTION public._image_recovery_predicate_by_mode(_loc locations, _mode text, _force boolean, _retry_stale_days integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when _loc.deleted_at is not null then false
    when _mode = 'missing' then
      public._image_recovery_candidate_predicate(_loc, _force, _retry_stale_days)
    when _mode = 'refresh' then
      coalesce(nullif(_loc.enriched_data->>'descripcion', ''), null) is not null
      and (
        _force
        or coalesce(nullif(_loc.enriched_data->'media'->>'image_recovery_attempted_at', ''), null) is null
        or (_loc.enriched_data->'media'->>'image_recovery_attempted_at')::timestamptz
           < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
      )
    when _mode = 'full' then true
    else false
  end;
$function$;

-- Fix: breakdown uses canonical enriched check
CREATE OR REPLACE FUNCTION public.admin_image_recovery_breakdown(_retry_stale_days integer DEFAULT 30)
 RETURNS TABLE(total_active bigint, enriched bigint, not_enriched bigint, with_image_any bigint, image_from_enriched bigint, image_from_user_url bigint, image_from_photos_table bigint, enriched_without_image bigint, pending_candidates bigint, in_cooldown bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'master')) then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select
      l.id,
      coalesce(nullif(l.enriched_data->>'imagen', ''), nullif(l.enriched_data->'media'->>'cover_url',''))  is not null as has_enriched_img,
      coalesce(nullif(l.user_image_url, ''), null)                                                          is not null as has_user_img,
      exists (select 1 from public.location_photos lp where lp.location_id = l.id)                                       as has_photos_row,
      coalesce(nullif(l.enriched_data->>'descripcion', ''), null) is not null                                            as is_enriched,
      public._image_recovery_candidate_predicate(l, false, _retry_stale_days)                                            as is_pending,
      public._image_recovery_candidate_predicate(l, true,  _retry_stale_days)                                            as is_force_universe
    from public.locations l
    where l.deleted_at is null
  )
  select
    count(*)::bigint                                                                                       as total_active,
    count(*) filter (where is_enriched)::bigint                                                            as enriched,
    count(*) filter (where not is_enriched)::bigint                                                        as not_enriched,
    count(*) filter (where has_enriched_img or has_user_img or has_photos_row)::bigint                     as with_image_any,
    count(*) filter (where has_enriched_img)::bigint                                                       as image_from_enriched,
    count(*) filter (where has_user_img and not has_enriched_img)::bigint                                  as image_from_user_url,
    count(*) filter (where has_photos_row and not has_enriched_img and not has_user_img)::bigint           as image_from_photos_table,
    count(*) filter (where is_enriched and not has_enriched_img and not has_user_img and not has_photos_row)::bigint as enriched_without_image,
    count(*) filter (where is_pending)::bigint                                                             as pending_candidates,
    count(*) filter (where is_force_universe and not is_pending)::bigint                                   as in_cooldown
  from base;
end;
$function$;
