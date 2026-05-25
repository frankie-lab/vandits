-- ============================================================================
-- PR-IDENTITY-ROOT-PERSIST-1 (retry: fix backfill LATERAL self-reference)
-- ============================================================================

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS identity_root_status text,
  ADD COLUMN IF NOT EXISTS identity_skip_reason text;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_identity_root_status_chk;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_identity_root_status_chk
  CHECK (identity_root_status IS NULL OR identity_root_status IN ('A','B','C','D'));

-- PARITY: supabase/functions/_shared/territorial-canon.ts (TERRITORIAL_CANON keys)
CREATE OR REPLACE FUNCTION public._is_canon_country_iso2(_iso2 text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _iso2 IS NOT NULL AND upper(_iso2) = ANY (ARRAY[
    'ES','FR','IT','GB','US','PT','RO','DE','FI','TR','MA','NO','PL','GR','NG',
    'CH','AT','NL','UA','SE','CN','AR','BR','CA','CL','NZ','AU','ZA','BE','EG',
    'ID','JP','MX','DZ','CO','KR','PH','IN','RU','IE','HR','RS','BG','HU','ML',
    'SK','CZ','SI','IS'
  ]);
$$;

CREATE OR REPLACE FUNCTION public._compute_identity_root_status(_loc public.locations)
RETURNS TABLE(root text, skip_reason text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _name text;
  _meta jsonb;
  _gh   text;
  _is_fixture boolean;
BEGIN
  IF _loc.deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT 'A'::text, 'deleted'::text; RETURN;
  END IF;
  IF _loc.is_approved IS FALSE THEN
    RETURN QUERY SELECT 'A'::text, 'not_approved'::text; RETURN;
  END IF;

  _meta := COALESCE(_loc.custom_data, '{}'::jsonb);
  _is_fixture :=
    _loc.owner_user_id = 'f04b3b95-7308-4b74-b3c7-7e819767c5fb'::uuid
    OR (_meta ->> 'synthetic') = 'true'
    OR COALESCE(_loc.id::text, '') LIKE '%e2e%'
    OR COALESCE(_loc.name, '') ~* '^beta-chain-';
  IF _is_fixture THEN
    RETURN QUERY SELECT 'D'::text, 'fixture'::text; RETURN;
  END IF;

  IF COALESCE((_meta ->> 'under_review')::boolean, false) THEN
    RETURN QUERY SELECT 'D'::text, 'under_review'::text; RETURN;
  END IF;

  IF _loc.enrichment_status = 'in_progress' THEN
    RETURN QUERY SELECT 'D'::text, 'in_progress'::text; RETURN;
  END IF;
  IF _loc.enrichment_status = 'unresolved' THEN
    RETURN QUERY SELECT 'D'::text, 'unresolved_flag'::text; RETURN;
  END IF;

  IF _loc.latitude IS NULL OR _loc.longitude IS NULL
     OR _loc.latitude  < -90  OR _loc.latitude  > 90
     OR _loc.longitude < -180 OR _loc.longitude > 180
     OR (abs(_loc.latitude) < 1e-7 AND abs(_loc.longitude) < 1e-7) THEN
    RETURN QUERY SELECT 'A'::text, 'invalid_coordinates'::text; RETURN;
  END IF;

  _name := btrim(COALESCE(_loc.name, ''));
  IF _name = '' THEN
    RETURN QUERY SELECT 'A'::text, 'root_a_missing_identity'::text; RETURN;
  END IF;

  _gh := lower(COALESCE(_loc.geo_health, ''));
  IF _gh IN ('broken','stale_name','empty') THEN
    RETURN QUERY SELECT 'C'::text, 'root_c_incoherent_identity'::text; RETURN;
  END IF;
  IF _gh IN ('harderror','hard_error') THEN
    RETURN QUERY SELECT 'C'::text, 'geo_hard_error'::text; RETURN;
  END IF;

  IF NOT public._is_canon_country_iso2(_loc.country_code) THEN
    RETURN QUERY SELECT 'B'::text, 'canon_gap'::text; RETURN;
  END IF;

  IF _gh = 'partial' THEN
    RETURN QUERY SELECT 'B'::text, 'root_b_unresolved'::text; RETURN;
  END IF;
  IF _loc.country_id IS NULL THEN
    RETURN QUERY SELECT 'B'::text, 'root_b_unresolved'::text; RETURN;
  END IF;
  IF _gh <> '' AND _gh <> 'ok' THEN
    RETURN QUERY SELECT 'B'::text, 'root_b_unresolved'::text; RETURN;
  END IF;

  IF COALESCE(btrim(_loc.enriched_data ->> 'descripcion'), '') <> '' THEN
    RETURN QUERY SELECT 'D'::text, 'already_enriched'::text; RETURN;
  END IF;

  RETURN QUERY SELECT 'D'::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.locations_set_identity_root_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _root text;
  _reason text;
  _need_recompute boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _need_recompute := true;
  ELSE
    _need_recompute := (
         OLD.name              IS DISTINCT FROM NEW.name
      OR OLD.latitude          IS DISTINCT FROM NEW.latitude
      OR OLD.longitude         IS DISTINCT FROM NEW.longitude
      OR OLD.country_code      IS DISTINCT FROM NEW.country_code
      OR OLD.country_id        IS DISTINCT FROM NEW.country_id
      OR OLD.geo_health        IS DISTINCT FROM NEW.geo_health
      OR OLD.enrichment_status IS DISTINCT FROM NEW.enrichment_status
      OR OLD.enriched_data     IS DISTINCT FROM NEW.enriched_data
      OR OLD.is_approved       IS DISTINCT FROM NEW.is_approved
      OR OLD.deleted_at        IS DISTINCT FROM NEW.deleted_at
      OR OLD.custom_data       IS DISTINCT FROM NEW.custom_data
      OR OLD.owner_user_id     IS DISTINCT FROM NEW.owner_user_id
    );
  END IF;

  IF NOT _need_recompute THEN
    RETURN NEW;
  END IF;

  -- Trigger name prefix `zzz1_` garantiza orden alfabético AFTER
  -- `zzz_locations_set_geo_health` (mismo BEFORE), por lo que NEW.geo_health
  -- ya está actualizado al clasificar.
  SELECT root, skip_reason
    INTO _root, _reason
    FROM public._compute_identity_root_status(NEW);

  NEW.identity_root_status := _root;
  NEW.identity_skip_reason := _reason;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz1_locations_set_identity_root_status ON public.locations;
CREATE TRIGGER zzz1_locations_set_identity_root_status
  BEFORE INSERT OR UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.locations_set_identity_root_status();

-- Backfill (CTE avoids LATERAL self-reference on UPDATE target)
WITH computed AS (
  SELECT l.id,
         (c).root        AS root,
         (c).skip_reason AS skip_reason
  FROM public.locations l
  CROSS JOIN LATERAL public._compute_identity_root_status(l) c
)
UPDATE public.locations l
SET identity_root_status = computed.root,
    identity_skip_reason = computed.skip_reason
FROM computed
WHERE l.id = computed.id
  AND (l.identity_root_status IS DISTINCT FROM computed.root
    OR l.identity_skip_reason IS DISTINCT FROM computed.skip_reason);

CREATE INDEX IF NOT EXISTS locations_root_pending_idx
  ON public.locations (identity_root_status, owner_user_id)
  WHERE identity_root_status IN ('A','B','C');