/**
 * Capability metadata (PR-RBAC-MATRIX-1).
 *
 * Capa semántica sobre el SoT (`src/domains/identity/capabilities.ts`) que
 * agrupa capabilities por dominio operativo y declara riesgo / impacto /
 * ownership. Sólo para representación UX del panel RBAC — NO altera gates,
 * RLS ni semántica de autorización.
 *
 * Si añades una capability nueva al SoT, declara también su metadata aquí.
 * El contract test `capability-metadata-coverage.test.ts` lo verifica.
 */
import type { Capability } from '@/domains/identity';

export type CapabilityDomain =
  | 'governance'
  | 'content'
  | 'geo'
  | 'runtime-config'
  | 'data-providers'
  | 'design-system'
  | 'recovery'
  | 'audit'
  | 'internal'
  | 'destructive';

export type RuntimeImpact =
  | 'immediate'
  | 'future-only'
  | 'recompute'
  | 'deferred'
  | 'none';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CapabilityMeta {
  domain: CapabilityDomain;
  /** Descripción corta orientada a gobernanza. */
  description: string;
  risk: RiskLevel;
  runtime: RuntimeImpact;
  /** master-only: prohibido asignar a otros roles. */
  masterOnly?: boolean;
  /** destructive: borra/altera datos de forma irreversible. */
  destructive?: boolean;
  /** internal: tooling interno, no se expone a operadores normales. */
  internal?: boolean;
}

export const DOMAIN_LABELS: Record<CapabilityDomain, string> = {
  governance: 'Governance',
  content: 'Content / Editorial',
  geo: 'Geo maintenance',
  'runtime-config': 'Runtime config',
  'data-providers': 'Data providers',
  'design-system': 'Design system',
  recovery: 'Recovery / batch ops',
  audit: 'Audit / debug',
  internal: 'Internal tooling',
  destructive: 'Destructive',
};

export const DOMAIN_ORDER: CapabilityDomain[] = [
  'governance',
  'content',
  'geo',
  'runtime-config',
  'data-providers',
  'design-system',
  'recovery',
  'audit',
  'internal',
  'destructive',
];

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  // Governance
  manage_users: {
    domain: 'governance',
    description: 'Crear, listar y modificar usuarios del sistema.',
    risk: 'high',
    runtime: 'immediate',
  },
  manage_permissions: {
    domain: 'governance',
    description: 'Modificar la matriz capability × role. Cambia el modelo RBAC.',
    risk: 'critical',
    runtime: 'immediate',
    masterOnly: true,
  },
  assign_master: {
    domain: 'destructive',
    description: 'Asignar o revocar el rol Master. Escalada total de privilegios.',
    risk: 'critical',
    runtime: 'immediate',
    masterOnly: true,
    destructive: true,
  },
  open_back_office: {
    domain: 'governance',
    description: 'Acceder a la superficie de BackOffice.',
    risk: 'low',
    runtime: 'immediate',
  },
  purge_user: {
    domain: 'destructive',
    description: 'Eliminar permanentemente todos los datos de un usuario.',
    risk: 'critical',
    runtime: 'immediate',
    destructive: true,
  },

  // Content / Editorial
  // PR-HYGIENE-2: purgadas add_locations, view_all_locations, edit_all_locations,
  // manage_documents, upload_files (sin consumidores reales).
  delete_any_location: {
    domain: 'destructive',
    description: 'Borrar ubicaciones de cualquier usuario.',
    risk: 'high',
    runtime: 'immediate',
    destructive: true,
  },
  manage_editorial_criteria: {
    domain: 'content',
    description: 'Editar criterios editoriales IA (freshness, thresholds, políticas de enrichment).',
    risk: 'medium',
    runtime: 'future-only',
  },
  moderate_content: {
    domain: 'content',
    description: 'Aprobar/rechazar contenido enviado por usuarios.',
    risk: 'medium',
    runtime: 'immediate',
  },

  // Geo maintenance
  view_geo_maintenance: {
    domain: 'geo',
    description: 'Ver panel y métricas de mantenimiento geográfico.',
    risk: 'low',
    runtime: 'none',
  },
  run_geo_backfill: {
    domain: 'geo',
    description: 'Lanzar jobs masivos de reparación geográfica (admin+master).',
    risk: 'high',
    runtime: 'deferred',
  },
  run_geo_canonicalize: {
    domain: 'destructive',
    description: 'One-shot de canonicalización de áreas administrativas. Reescribe FKs.',
    risk: 'critical',
    runtime: 'deferred',
    masterOnly: true,
    destructive: true,
  },
  // PR-HYGIENE-5: `manage_geo_maintenance` purgado (alias legacy sin consumidores).
  // Split canónico: view_geo_maintenance / run_geo_backfill / run_geo_canonicalize.

  // Runtime config
  manage_marker_config: {
    domain: 'runtime-config',
    description: 'Tamaños, colores y reglas visuales de marcadores. Aplica a todos los usuarios.',
    risk: 'low',
    runtime: 'immediate',
  },
  manage_route_engine: {
    domain: 'runtime-config',
    description: 'Configurar defaults del motor de rutas (override por usuario).',
    risk: 'low',
    runtime: 'future-only',
  },
  manage_icon_library: {
    domain: 'runtime-config',
    description: 'Gestionar galería global de iconos.',
    risk: 'low',
    runtime: 'immediate',
  },
  manage_enrichment_config: {
    domain: 'runtime-config',
    description: 'Estructura de fichas y campos de enrichment.',
    risk: 'medium',
    runtime: 'future-only',
  },

  // Data providers
  manage_data_sources: {
    domain: 'data-providers',
    description: 'Configurar fuentes externas de datos (scraping, APIs).',
    risk: 'medium',
    runtime: 'immediate',
  },

  // Design system (PR-HYGIENE-4: rename a inspect_*; el panel es read-only).
  inspect_design_system: {
    domain: 'design-system',
    description: 'Inspector read-only del design system (tokens, motion). No edita tokens persistentes.',
    risk: 'low',
    runtime: 'none',
    masterOnly: true,
  },

  // Recovery / batch ops
  run_image_recovery: {
    domain: 'recovery',
    description: 'Lanzar batch de recuperación de imágenes faltantes.',
    risk: 'medium',
    runtime: 'deferred',
  },
  run_global_enrichment: {
    domain: 'recovery',
    description: 'Disparar enrichment masivo sobre POIs globales.',
    risk: 'high',
    runtime: 'deferred',
  },

  // Audit / debug
  view_audit_log: {
    domain: 'audit',
    description: 'Ver auditoría de preferencias, resolución y eventos runtime.',
    risk: 'low',
    runtime: 'none',
  },
  // PR-HYGIENE-2: view_analytics purgada (sin consumidores).

  // Internal tooling
  run_internal_tooling: {
    domain: 'internal',
    description: 'Ejecutar tooling interno (create-test-users, scripts puntuales).',
    risk: 'high',
    runtime: 'immediate',
    masterOnly: true,
    internal: true,
  },
};

export const RISK_TONE: Record<RiskLevel, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-orange-600 dark:text-orange-400',
  critical: 'text-destructive',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
  critical: 'crítico',
};

export const RUNTIME_LABEL: Record<RuntimeImpact, string> = {
  immediate: 'efecto inmediato',
  'future-only': 'sólo datos futuros',
  recompute: 'requiere recompute',
  deferred: 'job en background',
  none: 'sin efecto runtime',
};
