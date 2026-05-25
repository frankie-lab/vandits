
-- 1) Fix search_path on 4 helper functions (dynamic, signature-agnostic)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('_collapse_admin_duplicates','_compute_location_geo_health','_merge_admin_area','_reclassify_admin_area')
      AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END$$;

-- 2) v_locations_resolved: enforce caller's RLS
ALTER VIEW public.v_locations_resolved SET (security_invoker = on);

-- 3) Revoke anon EXECUTE on admin/internal SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef = true
      AND p.proname = ANY (ARRAY[
        '_enqueue_geo_repair','_is_admin_or_master',
        'admin_broken_locations_for_user','admin_geo_coverage','admin_image_recovery_breakdown',
        'admin_image_recovery_locations','admin_image_recovery_scope','admin_image_recovery_users',
        'admin_user_geo_scope_ids','admin_user_geo_locations','admin_users_with_broken_geo_chain',
        'apply_orchestrator_enrichment','batch_orchestrator_health',
        'cancel_geocoding_job','cancel_image_recovery_job','claim_batch_items',
        'cleanup_old_deleted_locations','count_locations_with_broken_geo_chain','count_masters',
        'enqueue_health_repair','increment_image_recovery_progress',
        'locations_with_broken_geo_chain','lookup_trunk_place',
        'refresh_user_stats','restart_stale_batch_items',
        'set_location_owner_user_id','upsert_trunk_place'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
  END LOOP;
END$$;
