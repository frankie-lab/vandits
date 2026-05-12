-- 2a. Add status column
ALTER TABLE public.health_repair_actions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'enqueued'
    CHECK (status IN ('enqueued', 'partial_skip', 'no_eligible'));

-- 2b + 2c. Rewrite RPC: server-side health filter + always audit
CREATE OR REPLACE FUNCTION public.enqueue_health_repair(
  _action text,
  _scope_mode text,
  _location_ids uuid[]
)
RETURNS TABLE(job_id uuid, audit_id uuid, enqueued_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _job_id uuid;
  _existing_ids uuid[];
  _eligible_ids uuid[];
  _eligible_count integer := 0;
  _new_ids uuid[];
  _label text;
  _audit_id uuid;
  _cap integer := 5000;
  _enq integer := 0;
  _status text;
BEGIN
  -- 1. Contract validation -> EXCEPTION
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _action NOT IN ('partial', 'chain') THEN
    RAISE EXCEPTION 'invalid action: %', _action USING ERRCODE = '22023';
  END IF;
  IF _scope_mode NOT IN ('filtered', 'selection', 'viewport') THEN
    RAISE EXCEPTION 'invalid scope_mode: %', _scope_mode USING ERRCODE = '22023';
  END IF;
  IF _location_ids IS NULL OR array_length(_location_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'empty location_ids' USING ERRCODE = '22023';
  END IF;

  -- 2. Eligible = own + not deleted + health matches action
  SELECT array_agg(l.id)
    INTO _eligible_ids
  FROM public.locations l
  WHERE l.id = ANY(_location_ids)
    AND l.owner_user_id = _caller
    AND l.deleted_at IS NULL
    AND public._compute_location_geo_health_lookup(
          l.latitude, l.longitude,
          l.continent_id, l.country_id, l.region_id, l.zone_id,
          l.country, l.region, l.zone, l.country_code
        ) = ANY (
          CASE _action
            WHEN 'partial' THEN ARRAY['partial']
            WHEN 'chain'   THEN ARRAY['broken', 'stale_name']
          END
        );

  _eligible_count := COALESCE(array_length(_eligible_ids, 1), 0);

  _label := CASE _action
    WHEN 'partial' THEN 'health-cta: rellenar huecos admin'
    WHEN 'chain'   THEN 'health-cta: reparar cadena'
  END;

  -- 3. No eligible -> audit no_eligible, no job
  IF _eligible_count = 0 THEN
    INSERT INTO public.health_repair_actions (
      user_id, action, scope_mode, location_ids, location_count,
      job_id, triggered_from, status
    )
    VALUES (
      _caller, _action, _scope_mode, ARRAY[]::uuid[], 0,
      NULL, 'health_cta', 'no_eligible'
    )
    RETURNING id INTO _audit_id;

    RETURN QUERY SELECT NULL::uuid, _audit_id, 0;
    RETURN;
  END IF;

  -- 4. Try to reuse running job
  SELECT id, COALESCE(location_ids, ARRAY[]::uuid[])
    INTO _job_id, _existing_ids
  FROM public.geocoding_jobs
  WHERE user_id = _caller
    AND status = 'running'::geocoding_job_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    SELECT array_agg(x)
      INTO _new_ids
    FROM unnest(_eligible_ids) x
    WHERE NOT (x = ANY(_existing_ids));

    IF _new_ids IS NOT NULL AND array_length(_new_ids, 1) > 0 THEN
      IF COALESCE(array_length(_existing_ids, 1), 0) + array_length(_new_ids, 1) > _cap THEN
        _new_ids := _new_ids[1:GREATEST(_cap - COALESCE(array_length(_existing_ids, 1), 0), 0)];
      END IF;

      _enq := COALESCE(array_length(_new_ids, 1), 0);
      IF _enq > 0 THEN
        UPDATE public.geocoding_jobs
        SET location_ids   = _existing_ids || _new_ids,
            total_in_scope = COALESCE(total_in_scope, 0) + _enq,
            remaining      = COALESCE(remaining, 0) + _enq,
            updated_at     = now()
        WHERE id = _job_id;
      END IF;
    ELSE
      _new_ids := ARRAY[]::uuid[];
      _enq := 0;
    END IF;
  ELSE
    _new_ids := _eligible_ids;
    IF array_length(_new_ids, 1) > _cap THEN
      _new_ids := _new_ids[1:_cap];
    END IF;
    _enq := array_length(_new_ids, 1);

    INSERT INTO public.geocoding_jobs (
      user_id, created_by, mode, status, label,
      location_ids, total_in_scope, remaining, processed, failed, updated,
      "offset", page_size, scope
    )
    VALUES (
      _caller, _caller, 'repair', 'running'::geocoding_job_status,
      _label,
      _new_ids, _enq, _enq, 0, 0, 0,
      0, 25,
      jsonb_build_object('source', 'health_cta', 'action', _action, 'scope_mode', _scope_mode)
    )
    RETURNING id INTO _job_id;
  END IF;

  -- 5. Compute status vs eligible (NOT vs raw input)
  _status := CASE
    WHEN _enq = _eligible_count THEN 'enqueued'
    ELSE 'partial_skip'
  END;

  -- 6. Always audit with what was actually enqueued
  INSERT INTO public.health_repair_actions (
    user_id, action, scope_mode, location_ids, location_count,
    job_id, triggered_from, status
  )
  VALUES (
    _caller, _action, _scope_mode,
    COALESCE(_new_ids, ARRAY[]::uuid[]), _enq,
    _job_id, 'health_cta', _status
  )
  RETURNING id INTO _audit_id;

  RETURN QUERY SELECT _job_id, _audit_id, _enq;
END;
$function$;