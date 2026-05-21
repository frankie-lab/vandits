
CREATE TABLE IF NOT EXISTS public._catalog_pt_ra_concelhos_snapshot_2026_05_21 AS
SELECT id, parent_id, depth, path, is_placeholder, updated_at, now() AS snapshot_at
FROM public.admin_areas
WHERE id IN (
  '9ff3cfca-d9b0-4513-a651-3dc2988802f7','20a4b502-efbc-4ed2-973e-88c3b2174777',
  '596b8e70-4ea2-44bc-a678-dd1ea0119b02','0e6bab65-734b-43a2-a6d0-3ce16ff129bb',
  '6438b2c0-2505-4a07-add0-459cd16d2a9a','3c3dd862-7211-4663-879f-f4533cea997d',
  '50db5861-b99d-4297-90ef-47cf949933f0','c18ffee8-8dc3-4ee8-9565-3911816fbeb3',
  '3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','49df8bf0-2099-42f4-bcbb-9e013226b584',
  'e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d',
  '849c8814-8d84-4b98-80ac-97db2a31daf4','54cea6f2-d96b-40cb-9dd5-a7d44168be0d',
  'ff077b8a-869c-4ad9-8c51-739005f4a550','2ccad713-4ef4-4288-8f53-f23a8203abcb',
  '3b505034-3901-438a-9f53-37c6bc063de8'
);
ALTER TABLE public._catalog_pt_ra_concelhos_snapshot_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Masters read snapshot pt ra concelhos" ON public._catalog_pt_ra_concelhos_snapshot_2026_05_21;
CREATE POLICY "Masters read snapshot pt ra concelhos"
  ON public._catalog_pt_ra_concelhos_snapshot_2026_05_21
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

CREATE TABLE IF NOT EXISTS public._locations_ra_concelhos_snapshot_2026_05_21 AS
SELECT id, region_id, region, zone_id, zone, admin3_id, locality_id, sublocality_id, updated_at, now() AS snapshot_at
FROM public.locations
WHERE locality_id IN (
  '9ff3cfca-d9b0-4513-a651-3dc2988802f7','596b8e70-4ea2-44bc-a678-dd1ea0119b02',
  '0e6bab65-734b-43a2-a6d0-3ce16ff129bb','6438b2c0-2505-4a07-add0-459cd16d2a9a',
  '3c3dd862-7211-4663-879f-f4533cea997d','50db5861-b99d-4297-90ef-47cf949933f0',
  'c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557',
  '49df8bf0-2099-42f4-bcbb-9e013226b584','e28d5fef-2f8e-49f0-8854-0447104eb896',
  '572c2b43-cabb-41d5-b3a2-06e152303d1d','849c8814-8d84-4b98-80ac-97db2a31daf4',
  '54cea6f2-d96b-40cb-9dd5-a7d44168be0d','ff077b8a-869c-4ad9-8c51-739005f4a550'
)
OR (admin3_id='2ccad713-4ef4-4288-8f53-f23a8203abcb' AND (locality_id IS NULL OR locality_id NOT IN (
  '9ff3cfca-d9b0-4513-a651-3dc2988802f7','596b8e70-4ea2-44bc-a678-dd1ea0119b02',
  '0e6bab65-734b-43a2-a6d0-3ce16ff129bb','6438b2c0-2505-4a07-add0-459cd16d2a9a',
  '3c3dd862-7211-4663-879f-f4533cea997d','50db5861-b99d-4297-90ef-47cf949933f0',
  'c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557',
  '49df8bf0-2099-42f4-bcbb-9e013226b584','e28d5fef-2f8e-49f0-8854-0447104eb896',
  '572c2b43-cabb-41d5-b3a2-06e152303d1d','849c8814-8d84-4b98-80ac-97db2a31daf4',
  '54cea6f2-d96b-40cb-9dd5-a7d44168be0d','ff077b8a-869c-4ad9-8c51-739005f4a550'
)));
ALTER TABLE public._locations_ra_concelhos_snapshot_2026_05_21 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Masters read snapshot pt ra locations" ON public._locations_ra_concelhos_snapshot_2026_05_21;
CREATE POLICY "Masters read snapshot pt ra locations"
  ON public._locations_ra_concelhos_snapshot_2026_05_21
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

DO $$
DECLARE n int; BEGIN
  SELECT COUNT(*) INTO n FROM public._locations_ra_concelhos_snapshot_2026_05_21;
  IF n <> 40 THEN RAISE EXCEPTION 'P2 abort: expected 40 POIs, got %', n; END IF;
END $$;

UPDATE public.admin_areas SET is_placeholder=true, updated_at=now()
WHERE id IN ('20a4b502-efbc-4ed2-973e-88c3b2174777','ff077b8a-869c-4ad9-8c51-739005f4a550');

UPDATE public.admin_areas
SET depth=3, path=ARRAY['a988689f-a36d-43e4-90b0-79d6647a8b2e'::uuid,'cb47a8fd-fe71-48b3-81fd-7b1047260149'::uuid,'ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid,id], updated_at=now()
WHERE id='3b505034-3901-438a-9f53-37c6bc063de8';

UPDATE public.admin_areas
SET parent_id='ee871f7d-978f-4a6c-a314-92356fca7d93', depth=3,
    path=ARRAY['a988689f-a36d-43e4-90b0-79d6647a8b2e'::uuid,'cb47a8fd-fe71-48b3-81fd-7b1047260149'::uuid,'ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid,id], updated_at=now()
WHERE id IN ('9ff3cfca-d9b0-4513-a651-3dc2988802f7','3c3dd862-7211-4663-879f-f4533cea997d','c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d','54cea6f2-d96b-40cb-9dd5-a7d44168be0d','2ccad713-4ef4-4288-8f53-f23a8203abcb');

UPDATE public.admin_areas
SET parent_id='a0553c22-733b-4eea-a0ef-589b59cd0ef0', depth=3,
    path=ARRAY['a988689f-a36d-43e4-90b0-79d6647a8b2e'::uuid,'cb47a8fd-fe71-48b3-81fd-7b1047260149'::uuid,'a0553c22-733b-4eea-a0ef-589b59cd0ef0'::uuid,id], updated_at=now()
WHERE id IN ('596b8e70-4ea2-44bc-a678-dd1ea0119b02','0e6bab65-734b-43a2-a6d0-3ce16ff129bb','6438b2c0-2505-4a07-add0-459cd16d2a9a','50db5861-b99d-4297-90ef-47cf949933f0','49df8bf0-2099-42f4-bcbb-9e013226b584','849c8814-8d84-4b98-80ac-97db2a31daf4');

INSERT INTO public.location_geo_provenance
  (location_id, field_type, area_id, original_value, normalized_value, source, confidence, resolved_at)
SELECT l.id,'region',
  CASE WHEN l.locality_id IN ('9ff3cfca-d9b0-4513-a651-3dc2988802f7','3c3dd862-7211-4663-879f-f4533cea997d','c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d','54cea6f2-d96b-40cb-9dd5-a7d44168be0d','ff077b8a-869c-4ad9-8c51-739005f4a550') OR l.admin3_id='2ccad713-4ef4-4288-8f53-f23a8203abcb'
    THEN 'ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid ELSE 'a0553c22-733b-4eea-a0ef-589b59cd0ef0'::uuid END,
  COALESCE(l.region_id::text,''),
  CASE WHEN l.locality_id IN ('9ff3cfca-d9b0-4513-a651-3dc2988802f7','3c3dd862-7211-4663-879f-f4533cea997d','c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d','54cea6f2-d96b-40cb-9dd5-a7d44168be0d','ff077b8a-869c-4ad9-8c51-739005f4a550') OR l.admin3_id='2ccad713-4ef4-4288-8f53-f23a8203abcb'
    THEN 'PT-20 Açores' ELSE 'PT-30 Madeira' END,
  't23_p2_snapshot',100,now()
FROM public.locations l
WHERE l.id IN (SELECT id FROM public._locations_ra_concelhos_snapshot_2026_05_21)
ON CONFLICT (location_id, field_type) DO UPDATE
SET area_id=EXCLUDED.area_id, original_value=EXCLUDED.original_value,
    normalized_value=EXCLUDED.normalized_value, source=EXCLUDED.source,
    confidence=EXCLUDED.confidence, resolved_at=EXCLUDED.resolved_at;

UPDATE public.locations
SET region_id = CASE WHEN locality_id IN ('9ff3cfca-d9b0-4513-a651-3dc2988802f7','3c3dd862-7211-4663-879f-f4533cea997d','c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d','54cea6f2-d96b-40cb-9dd5-a7d44168be0d') THEN 'ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid ELSE 'a0553c22-733b-4eea-a0ef-589b59cd0ef0'::uuid END,
    region=NULL, zone_id=NULL, zone=NULL, admin3_id=locality_id, locality_id=NULL, updated_at=now()
WHERE locality_id IN ('9ff3cfca-d9b0-4513-a651-3dc2988802f7','596b8e70-4ea2-44bc-a678-dd1ea0119b02','0e6bab65-734b-43a2-a6d0-3ce16ff129bb','6438b2c0-2505-4a07-add0-459cd16d2a9a','3c3dd862-7211-4663-879f-f4533cea997d','50db5861-b99d-4297-90ef-47cf949933f0','c18ffee8-8dc3-4ee8-9565-3911816fbeb3','3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557','49df8bf0-2099-42f4-bcbb-9e013226b584','e28d5fef-2f8e-49f0-8854-0447104eb896','572c2b43-cabb-41d5-b3a2-06e152303d1d','849c8814-8d84-4b98-80ac-97db2a31daf4','54cea6f2-d96b-40cb-9dd5-a7d44168be0d');

UPDATE public.locations
SET region_id='ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid, region=NULL, zone_id=NULL, zone=NULL,
    admin3_id='3b505034-3901-438a-9f53-37c6bc063de8'::uuid, locality_id=NULL, updated_at=now()
WHERE locality_id='ff077b8a-869c-4ad9-8c51-739005f4a550';

UPDATE public.locations
SET region_id='ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid, region=NULL, zone_id=NULL, zone=NULL, updated_at=now()
WHERE admin3_id='2ccad713-4ef4-4288-8f53-f23a8203abcb'
  AND (region_id IS DISTINCT FROM 'ee871f7d-978f-4a6c-a314-92356fca7d93'::uuid OR zone_id IS NOT NULL OR zone IS NOT NULL);
