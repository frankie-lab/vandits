ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS in_catalog boolean NOT NULL DEFAULT false;

-- Backfill: marcar in_catalog=true para colecciones cuyos items (place/waypoint)
-- correspondan mayoritariamente a locations aprobadas (catálogo).
UPDATE public.collections c
SET in_catalog = true
WHERE EXISTS (
  SELECT 1
  FROM public.collection_items ci
  JOIN public.locations l ON l.id = ci.item_id
  WHERE ci.collection_id = c.id
    AND ci.item_type IN ('place', 'waypoint')
    AND l.is_approved = true
    AND l.deleted_at IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM public.collection_items ci
  JOIN public.locations l ON l.id = ci.item_id
  WHERE ci.collection_id = c.id
    AND ci.item_type IN ('place', 'waypoint')
    AND l.is_approved = false
    AND l.deleted_at IS NULL
);