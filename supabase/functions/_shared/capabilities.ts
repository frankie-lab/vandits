// SoT Deno único de capabilities (PR-BACKOFFICE-GOVERNANCE F1).
//
// Mirror del enum `public.app_permission` (SoT real = base de datos) y
// paralelo a `src/domains/identity/capabilities.ts`. Cualquier edge function
// DEBE importar `Capability` y `CAPABILITIES` desde aquí. Prohibido duplicar
// la unión literal en otros sitios.

export const CAPABILITIES = [
  // Clásicas
  "manage_users",
  "manage_criteria",
  "run_global_enrichment",
  "view_all_locations",
  "edit_all_locations",
  "delete_any_location",
  "manage_documents",
  "view_analytics",
  "moderate_content",
  "upload_files",
  "add_locations",
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
  "manage_design_system",
  "purge_user",
  "open_back_office",
] as const;

export type Capability = typeof CAPABILITIES[number];
