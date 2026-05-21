-- T-CATALOG-PT-DISTRICTS Phase 1: mark 34 orphan depth=2 PT mirror nodes as placeholder
-- Snapshot dedicated table (idempotent create) + populate + UPDATE in single transaction.

CREATE TABLE IF NOT EXISTS public._catalog_pt_districts_snapshot_2026_05_21 (
  id uuid PRIMARY KEY,
  is_placeholder boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._catalog_pt_districts_snapshot_2026_05_21 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Masters read snapshot pt districts" ON public._catalog_pt_districts_snapshot_2026_05_21;
CREATE POLICY "Masters read snapshot pt districts"
  ON public._catalog_pt_districts_snapshot_2026_05_21
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role));

-- Snapshot full d=2 baseline under PT (safe superset for rollback)
INSERT INTO public._catalog_pt_districts_snapshot_2026_05_21 (id, is_placeholder, updated_at)
SELECT id, is_placeholder, updated_at
FROM public.admin_areas
WHERE depth = 2
  AND parent_id = 'cb47a8fd-fe71-48b3-81fd-7b1047260149'
ON CONFLICT (id) DO NOTHING;

-- P1 UPDATE: only orphan d=2 mirror nodes, exclude 7 canonical CCDR, exclude any node
-- (or any node in any POI's referenced path) with direct or transitive POI references.
UPDATE public.admin_areas
SET is_placeholder = true,
    updated_at = now()
WHERE depth = 2
  AND parent_id = 'cb47a8fd-fe71-48b3-81fd-7b1047260149'
  AND is_placeholder = false
  AND id NOT IN (
    '0e0cd77d-36ee-4caf-a022-708ed2d109ef', -- PT-01 Norte
    '969ee249-484e-452a-9402-f26df5a0ae4e', -- PT-02 Centro
    '9574cd33-65ad-4e25-943b-ac4bcf46fdfb', -- PT-03 Lisboa
    'c568ed08-f88b-4f45-b17f-7f0a32ed3a8e', -- PT-04 Alentejo
    '1dab62f3-e593-4c81-b911-10d251f44de9', -- PT-05 Algarve
    'ee871f7d-978f-4a6c-a314-92356fca7d93', -- PT-20 Açores
    'a0553c22-733b-4eea-a0ef-589b59cd0ef0'  -- PT-30 Madeira
  )
  AND id NOT IN (
    SELECT DISTINCT a.id FROM public.admin_areas a
    JOIN public.locations l ON l.region_id=a.id OR l.zone_id=a.id OR l.admin3_id=a.id
                            OR l.locality_id=a.id OR l.sublocality_id=a.id
                            OR l.country_id=a.id OR l.continent_id=a.id
  )
  AND id NOT IN (
    SELECT DISTINCT unnest(a2.path) FROM public.admin_areas a2
    JOIN public.locations l2 ON l2.region_id=a2.id OR l2.zone_id=a2.id OR l2.admin3_id=a2.id
                             OR l2.locality_id=a2.id OR l2.sublocality_id=a2.id
  );