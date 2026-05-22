CREATE OR REPLACE FUNCTION public.enforce_orchestrator_update_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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