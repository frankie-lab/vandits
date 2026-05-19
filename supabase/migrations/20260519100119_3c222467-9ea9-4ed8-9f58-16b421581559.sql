
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS external_refs jsonb;

COMMENT ON COLUMN public.locations.external_refs IS
  'Optional external references namespaced by provider, e.g. { "maps": { "google": { "placeId": "...", "url": "...", "verifiedAt": "..." }, "apple": { "url": "...", "verifiedAt": "..." } } }. No backfill; writes opt-in.';

CREATE OR REPLACE VIEW public.v_locations_resolved AS
SELECT
  l.id,
  l.document_id,
  l.name,
  l.description,
  l.latitude,
  l.longitude,
  l.altitude,
  l.continent,
  l.country,
  l.region,
  l.zone,
  l.place_type,
  l.custom_data,
  l.enriched_data,
  l.created_at,
  l.updated_at,
  l.visibility,
  l.user_image_url,
  l.user_image_visibility,
  l.pioneer_user_id,
  l.deleted_at,
  l.enrichment_status,
  l.personal_category_id,
  l.is_approved,
  l.owner_user_id,
  l.type_id,
  l.continent_id,
  l.country_id,
  l.region_id,
  l.zone_id,
  l.admin3_id,
  l.locality_id,
  l.sublocality_id,
  l.street_name,
  l.country_code,
  l.admin1_iso,
  l.postal_code,
  l.timezone,
  l.geo_source,
  l.geo_confidence,
  l.geo_resolved_at,
  l.raw_geocode,
  l.geo_health,
  co.name AS continent_resolved,
  cu.name AS country_resolved,
  rg.name AS region_resolved,
  zn.name AS zone_resolved,
  a3.name AS admin_level_3,
  lc.name AS locality,
  sl.name AS sublocality,
  l.external_refs
FROM public.locations l
LEFT JOIN public.admin_areas co ON co.id = l.continent_id
LEFT JOIN public.admin_areas cu ON cu.id = l.country_id
LEFT JOIN public.admin_areas rg ON rg.id = l.region_id
LEFT JOIN public.admin_areas zn ON zn.id = l.zone_id
LEFT JOIN public.admin_areas a3 ON a3.id = l.admin3_id
LEFT JOIN public.admin_areas lc ON lc.id = l.locality_id
LEFT JOIN public.admin_areas sl ON sl.id = l.sublocality_id;
