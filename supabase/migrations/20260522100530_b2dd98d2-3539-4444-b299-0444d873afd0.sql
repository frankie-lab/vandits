-- P2 orchestrator fix: persist-and-verify helper.
-- Master-only RPC that sets the orchestrator GUC, performs the allowlisted
-- UPDATE on locations, and returns the post-write evidence so the caller can
-- verify persistence without trusting enrich-location's response shape.

CREATE OR REPLACE FUNCTION public.apply_orchestrator_enrichment(
  _location_id uuid,
  _enriched_data jsonb,
  _enrichment_status text DEFAULT 'enriched'
)
RETURNS TABLE (
  id uuid,
  enrichment_status text,
  updated_at timestamptz,
  descripcion_present boolean,
  descripcion_length integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'master'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Activate the orchestrator allowlist trigger for THIS transaction only.
  PERFORM set_config('app.batch_orchestrator', 'true', true);

  UPDATE public.locations l
     SET enriched_data = _enriched_data,
         enrichment_status = _enrichment_status,
         updated_at = now()
   WHERE l.id = _location_id;

  RETURN QUERY
  SELECT l.id,
         l.enrichment_status,
         l.updated_at,
         (l.enriched_data ? 'descripcion'
           AND length(coalesce(l.enriched_data->>'descripcion','')) > 0) AS descripcion_present,
         length(coalesce(l.enriched_data->>'descripcion','')) AS descripcion_length
    FROM public.locations l
   WHERE l.id = _location_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_orchestrator_enrichment(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_orchestrator_enrichment(uuid, jsonb, text) TO authenticated;