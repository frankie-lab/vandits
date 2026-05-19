/**
 * SoT TS único de capabilities (PR-BACKOFFICE-GOVERNANCE F1).
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
  'view_all_locations',
  'edit_all_locations',
  'delete_any_location',
  'manage_documents',
  'view_analytics',
  'moderate_content',
  'upload_files',
  'add_locations',
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
] as const;

export type Capability = typeof CAPABILITIES[number];

/** Etiquetas humanas para UI admin. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: 'Gestionar usuarios',
  manage_criteria: 'Gestionar criterios',
  run_global_enrichment: 'Enriquecimiento global',
  view_all_locations: 'Ver todas las ubicaciones',
  edit_all_locations: 'Editar ubicaciones',
  delete_any_location: 'Eliminar ubicaciones',
  manage_documents: 'Gestionar documentos',
  view_analytics: 'Ver estadísticas',
  moderate_content: 'Moderar contenido',
  upload_files: 'Subir archivos masivos',
  add_locations: 'Añadir ubicaciones',
  manage_permissions: 'Gestionar permisos',
  manage_marker_config: 'Configurar marcadores',
  manage_route_engine: 'Configurar motor de rutas',
  manage_icon_library: 'Gestionar galería de iconos',
  manage_enrichment_config: 'Configurar fichas',
  view_audit_log: 'Ver auditoría',
  manage_geo_maintenance: 'Mantenimiento geográfico',
  manage_data_sources: 'Gestionar fuentes de datos',
  run_image_recovery: 'Recuperar imágenes',
  manage_design_system: 'Gestionar Design System',
  purge_user: 'Limpiar usuarios',
  open_back_office: 'Acceder al Back Office',
  // PR-BACKOFFICE-GOVERNANCE F2 — split de capabilities
  assign_master: 'Asignar/revocar rol Master',
  run_internal_tooling: 'Ejecutar tooling interno',
  view_geo_maintenance: 'Ver mantenimiento geográfico',
  run_geo_backfill: 'Ejecutar backfills geográficos',
  run_geo_canonicalize: 'Canonicalizar áreas administrativas',
] as const;

export type Capability = typeof CAPABILITIES[number];

/** Etiquetas humanas para UI admin. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_users: 'Gestionar usuarios',
  manage_criteria: 'Gestionar criterios',
  run_global_enrichment: 'Enriquecimiento global',
  view_all_locations: 'Ver todas las ubicaciones',
  edit_all_locations: 'Editar ubicaciones',
  delete_any_location: 'Eliminar ubicaciones',
  manage_documents: 'Gestionar documentos',
  view_analytics: 'Ver estadísticas',
  moderate_content: 'Moderar contenido',
  upload_files: 'Subir archivos masivos',
  add_locations: 'Añadir ubicaciones',
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
  open_back_office: 'Acceder al Back Office',
};

/** Alias legacy: la app llamaba `AppPermission` a lo mismo. */
export type AppPermission = Capability;
