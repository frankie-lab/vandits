-- =====================================================================
-- Fase A — P2 Orchestrator schema (sin IA, sin escritura en locations)
-- =====================================================================

-- 1. enrichment_batch_runs
CREATE TABLE IF NOT EXISTS public.enrichment_batch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  source_csv_path text,
  scope_count integer NOT NULL DEFAULT 0,
  chunk_size integer NOT NULL DEFAULT 25,
  pause_seconds integer NOT NULL DEFAULT 60,
  max_ai_calls integer NOT NULL DEFAULT 25,
  ai_calls_used integer NOT NULL DEFAULT 0,
  max_runtime_minutes integer NOT NULL DEFAULT 60,
  max_error_rate_pct integer NOT NULL DEFAULT 5,
  confirm_full_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','paused','completed','aborted')),
  pause_reason text,
  abort_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_enrichment_batch_runs_updated_at
BEFORE UPDATE ON public.enrichment_batch_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.enrichment_batch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage enrichment_batch_runs"
ON public.enrichment_batch_runs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Admins read enrichment_batch_runs"
ON public.enrichment_batch_runs FOR SELECT
TO authenticated
USING (public._is_admin_or_master(auth.uid()));

-- 2. enrichment_batch_items
CREATE TABLE IF NOT EXISTS public.enrichment_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.enrichment_batch_runs(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  country_code text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_flight','success','fail','skip','noop')),
  skip_reason text,
  fail_reason text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  UNIQUE (run_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_ebi_pending
ON public.enrichment_batch_items (run_id, country_code, location_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ebi_in_flight
ON public.enrichment_batch_items (run_id, claimed_at)
WHERE status = 'in_flight';

ALTER TABLE public.enrichment_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage enrichment_batch_items"
ON public.enrichment_batch_items FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Admins read enrichment_batch_items"
ON public.enrichment_batch_items FOR SELECT
TO authenticated
USING (public._is_admin_or_master(auth.uid()));

-- 3. enrichment_batch_snapshots
CREATE TABLE IF NOT EXISTS public.enrichment_batch_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.enrichment_batch_runs(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  previous_enriched_data jsonb,
  previous_enrichment_status text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, location_id)
);

ALTER TABLE public.enrichment_batch_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage enrichment_batch_snapshots"
ON public.enrichment_batch_snapshots FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- 4. Trigger DB de allowlist ACOTADO por flag de sesión
--    SOLO actúa cuando current_setting('app.batch_orchestrator', true) = 'true'.
--    Importers, recovery, edición manual, otros jobs NO setean este flag
--    y por tanto NO se ven afectados.
CREATE OR REPLACE FUNCTION public.enforce_orchestrator_update_allowlist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_orchestrator boolean := COALESCE(
    current_setting('app.batch_orchestrator', true) = 'true',
    false
  );
BEGIN
  IF NOT is_orchestrator THEN
    RETURN NEW;
  END IF;

  -- Allowlist estricta para el orquestador:
  -- sólo enriched_data, enrichment_status, updated_at pueden cambiar.
  IF (NEW.name              IS DISTINCT FROM OLD.name)
  OR (NEW.latitude          IS DISTINCT FROM OLD.latitude)
  OR (NEW.longitude         IS DISTINCT FROM OLD.longitude)
  OR (NEW.country_id        IS DISTINCT FROM OLD.country_id)
  OR (NEW.region_id         IS DISTINCT FROM OLD.region_id)
  OR (NEW.zone_id           IS DISTINCT FROM OLD.zone_id)
  OR (NEW.admin3_id         IS DISTINCT FROM OLD.admin3_id)
  OR (NEW.locality_id       IS DISTINCT FROM OLD.locality_id)
  OR (NEW.sublocality_id    IS DISTINCT FROM OLD.sublocality_id)
  OR (NEW.continent_id      IS DISTINCT FROM OLD.continent_id)
  OR (NEW.country_id        IS DISTINCT FROM OLD.country_id)
  OR (NEW.country_code      IS DISTINCT FROM OLD.country_code)
  OR (NEW.type_id           IS DISTINCT FROM OLD.type_id)
  OR (NEW.owner_user_id     IS DISTINCT FROM OLD.owner_user_id)
  OR (NEW.visibility        IS DISTINCT FROM OLD.visibility)
  OR (NEW.is_approved       IS DISTINCT FROM OLD.is_approved)
  OR (NEW.custom_data       IS DISTINCT FROM OLD.custom_data)
  OR (NEW.place_type        IS DISTINCT FROM OLD.place_type)
  OR (NEW.personal_category_id IS DISTINCT FROM OLD.personal_category_id)
  OR (NEW.description       IS DISTINCT FROM OLD.description)
  OR (NEW.altitude          IS DISTINCT FROM OLD.altitude)
  OR (NEW.raw_geocode       IS DISTINCT FROM OLD.raw_geocode)
  OR (NEW.geo_health        IS DISTINCT FROM OLD.geo_health)
  OR (NEW.geo_source        IS DISTINCT FROM OLD.geo_source)
  OR (NEW.geo_confidence    IS DISTINCT FROM OLD.geo_confidence)
  OR (NEW.geo_resolved_at   IS DISTINCT FROM OLD.geo_resolved_at)
  OR (NEW.country           IS DISTINCT FROM OLD.country)
  OR (NEW.region            IS DISTINCT FROM OLD.region)
  OR (NEW.zone              IS DISTINCT FROM OLD.zone)
  OR (NEW.continent         IS DISTINCT FROM OLD.continent)
  OR (NEW.deleted_at        IS DISTINCT FROM OLD.deleted_at)
  OR (NEW.user_image_url    IS DISTINCT FROM OLD.user_image_url)
  OR (NEW.user_image_visibility IS DISTINCT FROM OLD.user_image_visibility)
  OR (NEW.street_name       IS DISTINCT FROM OLD.street_name)
  OR (NEW.postal_code       IS DISTINCT FROM OLD.postal_code)
  OR (NEW.timezone          IS DISTINCT FROM OLD.timezone)
  OR (NEW.external_refs     IS DISTINCT FROM OLD.external_refs)
  OR (NEW.admin1_iso        IS DISTINCT FROM OLD.admin1_iso)
  OR (NEW.pioneer_user_id   IS DISTINCT FROM OLD.pioneer_user_id)
  OR (NEW.document_id       IS DISTINCT FROM OLD.document_id)
  THEN
    RAISE EXCEPTION 'orchestrator_update_outside_allowlist: only enriched_data/enrichment_status/updated_at are allowed when app.batch_orchestrator is active'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_orchestrator_update_allowlist ON public.locations;
CREATE TRIGGER trg_enforce_orchestrator_update_allowlist
BEFORE UPDATE ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.enforce_orchestrator_update_allowlist();

-- 5. RPC: claim atómico (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_batch_items(_run_id uuid, _chunk_size integer DEFAULT 25)
RETURNS TABLE (item_id uuid, location_id uuid, country_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'master'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH next AS (
    SELECT i.id
    FROM public.enrichment_batch_items i
    WHERE i.run_id = _run_id
      AND i.status = 'pending'
    ORDER BY i.country_code ASC NULLS LAST, i.location_id ASC
    LIMIT GREATEST(_chunk_size, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.enrichment_batch_items i
  SET status = 'in_flight',
      claimed_at = now(),
      attempts = i.attempts + 1
  FROM next
  WHERE i.id = next.id
  RETURNING i.id AS item_id, i.location_id, i.country_code;
END;
$$;

-- 6. RPC: restart stale items (in_flight huérfanos)
CREATE OR REPLACE FUNCTION public.restart_stale_batch_items(
  _run_id uuid,
  _stale_minutes integer DEFAULT 5
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'master'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrichment_batch_items
  SET status = 'pending',
      claimed_at = NULL
  WHERE run_id = _run_id
    AND status = 'in_flight'
    AND claimed_at IS NOT NULL
    AND claimed_at < (now() - make_interval(mins => GREATEST(_stale_minutes, 1)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7. RPC: contar masters (helper para verificar conteo en tests/status)
--    (no-op si ya existe; idempotente)
CREATE OR REPLACE FUNCTION public.batch_orchestrator_health()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'trigger_active', EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_enforce_orchestrator_update_allowlist'
    ),
    'runs_table', to_regclass('public.enrichment_batch_runs') IS NOT NULL,
    'items_table', to_regclass('public.enrichment_batch_items') IS NOT NULL,
    'snapshots_table', to_regclass('public.enrichment_batch_snapshots') IS NOT NULL
  );
$$;