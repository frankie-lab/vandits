// SoT Deno único de capabilities (PR-BACKOFFICE-GOVERNANCE F1).
//
// Mirror del enum `public.app_permission` (SoT real = base de datos) y
// paralelo a `src/domains/identity/capabilities.ts`. Cualquier edge function
// DEBE importar `Capability` y `CAPABILITIES` desde aquí. Prohibido duplicar
// la unión literal en otros sitios.

export const CAPABILITIES = [
  // Clásicas
  "manage_users",
  "manage_editorial_criteria",
  "run_global_enrichment",
  "delete_any_location",
  "moderate_content",
  // Operacionales (PR-ADMIN-AUDIT-1b)
  "manage_permissions",
  "manage_marker_config",
  "manage_route_engine",
  "manage_icon_library",
  "manage_enrichment_config",
  "view_audit_log",
  "manage_geo_maintenance",
  "manage_data_sources",
  "run_image_recovery",
  "inspect_design_system",
  "purge_user",
  "open_back_office",
  // PR-BACKOFFICE-GOVERNANCE F2 — split de capabilities críticas
  "assign_master",
  "run_internal_tooling",
  "view_geo_maintenance",
  "run_geo_backfill",
  "run_geo_canonicalize",
] as const;
// PR-HYGIENE-2: purgadas capabilities zombie sin consumidores (view_all_locations,
// edit_all_locations, manage_documents, view_analytics, upload_files, add_locations).
// PR-HYGIENE-4: rename semántico — manage_design_system -> inspect_design_system,
// manage_criteria -> manage_editorial_criteria. Sin cambio de scope/gating/runtime.

export type Capability = typeof CAPABILITIES[number];
