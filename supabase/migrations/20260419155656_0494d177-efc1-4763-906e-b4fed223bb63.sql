-- 1. Borrar el documento duplicado más antiguo (17 abr) — cascada borrará sus locations
DELETE FROM public.documents WHERE id = '40744f62-76af-4e2d-9848-0409d1476922';

-- 2. Reparar el documento del 19 abr: counters + source_type + status confirmed
UPDATE public.documents
SET 
  source_type = 'kml',
  import_status = 'confirmed',
  confirmed_at = NOW(),
  total_waypoints = (SELECT COUNT(*) FROM public.locations WHERE document_id = 'c7eb5a55-77a1-496c-ba17-2f0e91958392' AND deleted_at IS NULL),
  resolved_count = (SELECT COUNT(*) FROM public.locations WHERE document_id = 'c7eb5a55-77a1-496c-ba17-2f0e91958392' AND is_approved = true AND deleted_at IS NULL),
  pending_count = (SELECT COUNT(*) FROM public.locations WHERE document_id = 'c7eb5a55-77a1-496c-ba17-2f0e91958392' AND is_approved = false AND deleted_at IS NULL)
WHERE id = 'c7eb5a55-77a1-496c-ba17-2f0e91958392';