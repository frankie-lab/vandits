-- PR-SECURITY-EDGE-AUTH-1 (Bloque 2) — fusión de las 2 migraciones de seguridad del sandbox.
-- Scope: auth/RLS only. DROP TABLE admin_areas_name_backup_2026_05_11 excluido a propósito (cleanup en PR aparte).

-- ===== Parte A: data_sources + user_achievements RLS =====

DROP POLICY IF EXISTS "data_sources select all auth" ON public.data_sources;
DROP POLICY IF EXISTS "data_sources admin read" ON public.data_sources;
CREATE POLICY "data_sources admin read"
  ON public.data_sources FOR SELECT
  TO authenticated
  USING (public._is_admin_or_master(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can read own achievements" ON public.user_achievements;
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public._is_admin_or_master(auth.uid()));

-- ===== Parte B: search_path + security_invoker + revoke anon EXECUTE =====

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

ALTER VIEW public.v_locations_resolved SET (security_invoker = on);

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