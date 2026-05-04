-- Cleanup orphan collection_items + cascading triggers

-- 1) One-shot cleanup of existing orphans
DELETE FROM public.collection_items ci
WHERE ci.item_type = 'place'
  AND NOT EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = ci.item_id AND l.deleted_at IS NULL
  );

DELETE FROM public.collection_items ci
WHERE ci.item_type = 'route'
  AND NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = ci.item_id);

DELETE FROM public.collection_items ci
WHERE ci.item_type = 'waypoint'
  AND NOT EXISTS (SELECT 1 FROM public.route_waypoints w WHERE w.id = ci.item_id);

-- 2) Auto-delete now-empty collections (post-cleanup)
DELETE FROM public.collections c
WHERE NOT EXISTS (
  SELECT 1 FROM public.collection_items ci WHERE ci.collection_id = c.id
);

-- 3) Trigger: when a location is soft-deleted or hard-deleted, purge its collection_items
CREATE OR REPLACE FUNCTION public.purge_collection_items_on_location_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected_collection_ids uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT collection_id) INTO affected_collection_ids
  FROM public.collection_items
  WHERE item_type = 'place' AND item_id = COALESCE(NEW.id, OLD.id);

  DELETE FROM public.collection_items
  WHERE item_type = 'place' AND item_id = COALESCE(NEW.id, OLD.id);

  IF affected_collection_ids IS NOT NULL THEN
    DELETE FROM public.collections c
    WHERE c.id = ANY(affected_collection_ids)
      AND NOT EXISTS (SELECT 1 FROM public.collection_items ci WHERE ci.collection_id = c.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_purge_collection_items ON public.locations;
CREATE TRIGGER trg_locations_purge_collection_items
AFTER UPDATE OF deleted_at OR DELETE ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.purge_collection_items_on_location_delete();

-- 4) Trigger: when a route is deleted, purge its collection_items + auto-delete empty collections
CREATE OR REPLACE FUNCTION public.purge_collection_items_on_route_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected_collection_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT collection_id) INTO affected_collection_ids
  FROM public.collection_items
  WHERE item_type = 'route' AND item_id = OLD.id;

  DELETE FROM public.collection_items
  WHERE item_type = 'route' AND item_id = OLD.id;

  IF affected_collection_ids IS NOT NULL THEN
    DELETE FROM public.collections c
    WHERE c.id = ANY(affected_collection_ids)
      AND NOT EXISTS (SELECT 1 FROM public.collection_items ci WHERE ci.collection_id = c.id);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_routes_purge_collection_items ON public.routes;
CREATE TRIGGER trg_routes_purge_collection_items
AFTER DELETE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.purge_collection_items_on_route_delete();