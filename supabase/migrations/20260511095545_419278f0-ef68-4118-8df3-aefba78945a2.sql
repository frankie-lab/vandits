
CREATE OR REPLACE FUNCTION public._enqueue_geo_repair(_user_id uuid, _location_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job_id uuid;
  _cap integer := 5000;
  _existing_ids uuid[];
BEGIN
  IF _user_id IS NULL OR _location_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, COALESCE(location_ids, ARRAY[]::uuid[])
    INTO _job_id, _existing_ids
  FROM public.geocoding_jobs
  WHERE user_id = _user_id
    AND status = 'running'::geocoding_job_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    IF COALESCE(array_length(_existing_ids, 1), 0) >= _cap THEN
      RETURN;
    END IF;
    IF _location_id = ANY(_existing_ids) THEN
      RETURN;
    END IF;
    UPDATE public.geocoding_jobs
    SET location_ids   = array_append(_existing_ids, _location_id),
        total_in_scope = COALESCE(total_in_scope, 0) + 1,
        remaining      = COALESCE(remaining, 0) + 1,
        updated_at     = now()
    WHERE id = _job_id;
  ELSE
    INSERT INTO public.geocoding_jobs (
      user_id, created_by, mode, status, label,
      location_ids, total_in_scope, remaining, processed, failed, updated,
      "offset", page_size, scope
    )
    VALUES (
      _user_id, _user_id, 'repair', 'running'::geocoding_job_status,
      'auto-repair (enrichment fallout)',
      ARRAY[_location_id], 1, 1, 0, 0, 0,
      0, 25, '{}'::jsonb
    );
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.locations_auto_enqueue_geo_repair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _changed boolean := false;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN RETURN NEW; END IF;
  IF NEW.owner_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.geo_health IS NULL OR NEW.geo_health NOT IN ('broken', 'partial', 'stale_name') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _changed := true;
  ELSE
    _changed := (
      OLD.enriched_data IS DISTINCT FROM NEW.enriched_data
      OR OLD.geo_health    IS DISTINCT FROM NEW.geo_health
      OR OLD.continent_id  IS DISTINCT FROM NEW.continent_id
      OR OLD.country_id    IS DISTINCT FROM NEW.country_id
      OR OLD.region_id     IS DISTINCT FROM NEW.region_id
      OR OLD.zone_id       IS DISTINCT FROM NEW.zone_id
      OR OLD.admin3_id     IS DISTINCT FROM NEW.admin3_id
      OR OLD.locality_id   IS DISTINCT FROM NEW.locality_id
      OR OLD.sublocality_id IS DISTINCT FROM NEW.sublocality_id
      OR OLD.country_code  IS DISTINCT FROM NEW.country_code
    );
  END IF;

  IF _changed THEN
    PERFORM public._enqueue_geo_repair(NEW.owner_user_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_locations_auto_enqueue_geo_repair ON public.locations;
CREATE TRIGGER trg_locations_auto_enqueue_geo_repair
AFTER INSERT OR UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.locations_auto_enqueue_geo_repair();


CREATE INDEX IF NOT EXISTS idx_geocoding_jobs_user_mode_status
  ON public.geocoding_jobs (user_id, mode, status);


DO $$
DECLARE
  rec RECORD;
  _ids uuid[];
  _count integer;
  _active_job uuid;
  _active_ids uuid[];
  _merged uuid[];
BEGIN
  FOR rec IN
    SELECT v.owner_user_id AS uid, array_agg(v.id) AS ids
    FROM public.v_location_geo_health v
    JOIN public.locations l ON l.id = v.id
    WHERE v.owner_user_id IS NOT NULL
      AND v.health IN ('broken', 'partial', 'stale_name')
      AND l.deleted_at IS NULL
      AND l.enriched_data IS NOT NULL
      AND (l.enriched_data ? 'descripcion')
      AND COALESCE(l.enriched_data->>'descripcion', '') <> ''
    GROUP BY v.owner_user_id
  LOOP
    _ids := rec.ids;
    _count := COALESCE(array_length(_ids, 1), 0);
    IF _count = 0 THEN CONTINUE; END IF;

    SELECT id, COALESCE(location_ids, ARRAY[]::uuid[])
      INTO _active_job, _active_ids
    FROM public.geocoding_jobs
    WHERE user_id = rec.uid
      AND status = 'running'::geocoding_job_status
    ORDER BY created_at DESC
    LIMIT 1;

    IF _active_job IS NOT NULL THEN
      SELECT array_agg(DISTINCT x)
        INTO _merged
      FROM unnest(_active_ids || _ids) AS x;
      UPDATE public.geocoding_jobs
      SET location_ids   = _merged,
          total_in_scope = COALESCE(array_length(_merged, 1), 0),
          remaining      = GREATEST(
                             COALESCE(array_length(_merged, 1), 0)
                             - COALESCE(processed, 0)
                             - COALESCE(failed, 0),
                             0),
          updated_at     = now()
      WHERE id = _active_job;
    ELSE
      INSERT INTO public.geocoding_jobs (
        user_id, created_by, mode, status, label,
        location_ids, total_in_scope, remaining, processed, failed, updated,
        "offset", page_size, scope
      )
      VALUES (
        rec.uid, rec.uid, 'repair', 'running'::geocoding_job_status,
        'auto-repair (initial backfill)',
        _ids, _count, _count, 0, 0, 0,
        0, 25, '{}'::jsonb
      );
    END IF;
  END LOOP;
END;
$$;
