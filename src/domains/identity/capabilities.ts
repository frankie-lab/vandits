/**
 * SoT TS único de capabilities (PR-BACKOFFICE-GOVERNANCE F1 + F2).
 *
 * Mirror del enum `public.app_permission` (SoT real = base de datos).
 * Cualquier consumidor cliente DEBE importar `Capability` y `CAPABILITIES`
 * desde aquí. Prohibido duplicar listas en componentes o hooks.
 *
 * El espejo Deno vive en `supabase/functions/_shared/capabilities.ts` y
 * DEBE permanecer en paridad — un contract test lo verifica.
 */

export const CAPABILITIES = [
  // Clásicas
  'manage_users',
  'manage_criteria',
  'run_global_enrichment',
  'delete_any_location',
  'moderate_content',
  // Operacionales (PR-ADMIN-AUDIT-1b)
  'manage_permissions',
  'manage_marker_config',
  'manage_route_engine',
  'manage_icon_library',
  'manage_enrichment_config',
  'view_audit_log',
  'manage_geo_maintenance',
  'manage_data_sources',
  'run_image_recovery',
  'manage_design_system',
  'purge_user',
  'open_back_office',
  // PR-BACKOFFICE-GOVERNANCE F2 — split de capabilities críticas
  'assign_master',
  'run_internal_tooling',
  'view_geo_maintenance',
  'run_geo_backfill',
  'run_geo_canonicalize',
] as const;
// PR-HYGIENE-2: purgadas capabilities zombie sin consumidores (view_all_locations,
// edit_all_locations, manage_documents, view_analytics, upload_files, add_locations).

export type Capability = typeof CAPABILITIES[number];

/** Etiquetas humanas para UI admin. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: 'Gestionar usuarios',
  manage_criteria: 'Gestionar criterios',
  run_global_enrichment: 'Enriquecimiento global',
  delete_any_location: 'Eliminar ubicaciones',
  moderate_content: 'Moderar contenido',
  manage_permissions: 'Gestionar permisos',
  manage_marker_config: 'Configurar marcadores',
  manage_route_engine: 'Configurar motor de rutas',
  manage_icon_library: 'Gestionar galería de iconos',
  manage_enrichment_config: 'Configurar fichas',
  view_audit_log: 'Ver auditoría',
  manage_geo_maintenance: 'Mantenimiento geográfico (legacy alias)',
  manage_data_sources: 'Gestionar fuentes de datos',
  run_image_recovery: 'Recuperar imágenes',
  manage_design_system: 'Gestionar Design System',
  purge_user: 'Limpiar usuarios',
  open_back_office: 'Acceder al Back Office',
  // PR-BACKOFFICE-GOVERNANCE F2
  assign_master: 'Asignar/revocar rol Master',
  run_internal_tooling: 'Ejecutar tooling interno',
  view_geo_maintenance: 'Ver mantenimiento geográfico',
  run_geo_backfill: 'Ejecutar backfills geográficos',
  run_geo_canonicalize: 'Canonicalizar áreas administrativas',
};

/** Alias legacy: la app llamaba `AppPermission` a lo mismo. */
export type AppPermission = Capability;
