-- Helper SECURITY DEFINER para cancelar un job de geocodificación de forma fiable.
-- El UPDATE directo desde el cliente puede fallar silenciosamente si la sesión
-- está caducada o si el cliente atacó la fila equivocada. Esta RPC garantiza:
--   * El llamador sea el dueño del job O tenga rol admin/master.
--   * El UPDATE corra con privilegios elevados (no depende de la RLS de UPDATE).
--   * Devuelva el número de filas afectadas para que el cliente lo verifique.
CREATE OR REPLACE FUNCTION public.cancel_geocoding_job(_job_id uuid)
RETURNS TABLE(updated_count integer, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_status text;
  v_updated integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT user_id, status INTO v_owner, v_status
  FROM public.geocoding_jobs
  WHERE id = _job_id;

  IF v_owner IS NULL THEN
    RETURN QUERY SELECT 0, NULL::text;
    RETURN;
  END IF;

  IF v_owner <> v_caller
     AND NOT has_role(v_caller, 'admin'::app_role)
     AND NOT has_role(v_caller, 'master'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status NOT IN ('running', 'canceling') THEN
    -- Nada que cancelar.
    RETURN QUERY SELECT 0, v_status;
    RETURN;
  END IF;

  UPDATE public.geocoding_jobs
  SET status = 'canceling'
  WHERE id = _job_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN QUERY SELECT v_updated, 'canceling'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_geocoding_job(uuid) TO authenticated;