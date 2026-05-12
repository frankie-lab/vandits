-- Audit log table
CREATE TABLE public.health_repair_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('partial', 'chain')),
  scope_mode text NOT NULL CHECK (scope_mode IN ('filtered', 'selection', 'viewport')),
  location_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  location_count integer NOT NULL DEFAULT 0,
  job_id uuid REFERENCES public.geocoding_jobs(id) ON DELETE SET NULL,
  triggered_from text NOT NULL DEFAULT 'health_cta',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_repair_actions_user ON public.health_repair_actions(user_id, created_at DESC);
CREATE INDEX idx_health_repair_actions_job ON public.health_repair_actions(job_id);

ALTER TABLE public.health_repair_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own repair actions"
  ON public.health_repair_actions FOR SELECT
  USING (auth.uid() = user_id OR public._is_admin_or_master(auth.uid()));

CREATE POLICY "Users insert own repair actions"
  ON public.health_repair_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Bulk enqueue + audit
CREATE OR REPLACE FUNCTION public.enqueue_health_repair(
  _action text,
  _scope_mode text,
  _location_ids uuid[]
)
RETURNS TABLE(job_id uuid, audit_id uuid, enqueued_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _job_id uuid;
  _existing_ids uuid[];
  _new_ids uuid[];
  _label text;
  _audit_id uuid;
  _cap integer := 5000;
  _enq integer := 0;
BEGIN
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

  -- Filtrar a solo locations propias y no borradas
  SELECT array_agg(l.id)
    INTO _new_ids
  FROM public.locations l
  WHERE l.id = ANY(_location_ids)
    AND l.owner_user_id = _caller
    AND l.deleted_at IS NULL;

  IF _new_ids IS NULL OR array_length(_new_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no eligible locations' USING ERRCODE = '22023';
  END IF;

  _label := CASE _action
    WHEN 'partial' THEN 'health-cta: rellenar huecos admin'
    WHEN 'chain' THEN 'health-cta: reparar cadena'
  END;

  -- Reusar job running si existe
  SELECT id, COALESCE(location_ids, ARRAY[]::uuid[])
    INTO _job_id, _existing_ids
  FROM public.geocoding_jobs
  WHERE user_id = _caller
    AND status = 'running'::geocoding_job_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    -- Append solo IDs nuevos
    SELECT array_agg(x)
      INTO _new_ids
    FROM unnest(_new_ids) x
    WHERE NOT (x = ANY(_existing_ids));

    IF _new_ids IS NOT NULL AND array_length(_new_ids, 1) > 0 THEN
      -- Cap defensivo
      IF COALESCE(array_length(_existing_ids, 1), 0) + array_length(_new_ids, 1) > _cap THEN
        _new_ids := _new_ids[1:(_cap - COALESCE(array_length(_existing_ids, 1), 0))];
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
    END IF;
  ELSE
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

  INSERT INTO public.health_repair_actions (
    user_id, action, scope_mode, location_ids, location_count, job_id, triggered_from
  )
  VALUES (
    _caller, _action, _scope_mode, _location_ids, COALESCE(array_length(_location_ids, 1), 0),
    _job_id, 'health_cta'
  )
  RETURNING id INTO _audit_id;

  RETURN QUERY SELECT _job_id, _audit_id, _enq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_health_repair(text, text, uuid[]) TO authenticated;