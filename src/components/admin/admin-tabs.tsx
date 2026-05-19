/**
 * Admin tabs canon — declarative table (PR-ADMIN-AUDIT Step 3).
 *
 * Single source of truth for:
 *   - which admin surfaces exist
 *   - which capability gates each one (frontend mirror of server `has_permission`)
 *   - which icon + label render in menu and panel header
 *
 * Consumers: `UserMenu` (Back Office submenu), `AdminPanel` (body switch).
 * Do NOT hardcode `isMaster()`/role checks for tab gating — read from here.
 */

import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';
import {
  Users,
  SlidersHorizontal,
  Ruler,
  Settings,
  FileText,
  Compass,
  Database,
  Image as ImageIcon,
  Palette,
  Route as RouteIcon,
  ShieldAlert,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@/domains/identity';

// Lazy-load tab bodies to keep AdminPanel split.
const MarkerSizeManager = lazy(() => import('@/components/MarkerSizeManager').then(m => ({ default: m.MarkerSizeManager })));
const RouteSettingsPanelContent = lazy(() => import('@/components/RouteSettingsPanel').then(m => ({ default: m.RouteSettingsPanelContent })));
const IconLibraryManager = lazy(() => import('@/components/IconLibraryManager').then(m => ({ default: m.IconLibraryManager })));
const EnrichmentCardConfig = lazy(() => import('@/domains/content/components').then(m => ({ default: m.EnrichmentCardConfig })));
const AuditPanel = lazy(() => import('@/components/AuditPanel').then(m => ({ default: m.AuditPanel })));
const GeographyBackfillPanel = lazy(() => import('@/components/admin/GeographyBackfillPanel').then(m => ({ default: m.GeographyBackfillPanel })));
const DataSourcesPanel = lazy(() => import('@/components/admin/DataSourcesPanel').then(m => ({ default: m.DataSourcesPanel })));
const RecoverImagesPanel = lazy(() => import('@/components/admin/RecoverImagesPanel').then(m => ({ default: m.RecoverImagesPanel })));
const DesignSystemPanel = lazy(() => import('@/components/admin/DesignSystemPanel').then(m => ({ default: m.DesignSystemPanel })));
const InternalToolsPanel = lazy(() => import('@/components/admin/InternalToolsPanel').then(m => ({ default: m.InternalToolsPanel })));

export type AdminTabKey =
  | 'users'
  | 'permissions'
  | 'markers'
  | 'routes'
  | 'icons'
  | 'enrichment'
  | 'audit'
  | 'geography'
  | 'sources'
  | 'image-recovery'
  | 'design-system'
  | 'internal-tools';

export interface AdminTabSpec {
  key: AdminTabKey;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  capability: Capability;
  /** Wider modal (max-w-6xl) when true. Only meaningful for routeMode='modal'. */
  wide?: boolean;
  /**
   * Where this surface lives in the BackOffice UX (PR-BACKOFFICE-UX-CANON-3).
   *   - 'modal' (default): legacy modal, body rendered inside AdminPanel.
   *   - 'route': dedicated `/admin/<key>` page rendered by AdminShell.
   * Capability gate is identical in both modes; only the container changes.
   */
  routeMode?: 'modal' | 'route';
  /**
   * Lazy component. `null` for tabs whose body still lives inline inside
   * AdminPanel (users / permissions) — those render via the legacy switch
   * but their menu entry + gate are still driven from this table.
   */
  Component: LazyExoticComponent<ComponentType<unknown>> | null;
}

export const ADMIN_TABS: readonly AdminTabSpec[] = [
  {
    key: 'users',
    label: 'Gestión de usuarios',
    icon: Users,
    iconClass: 'text-purple-500',
    capability: 'manage_users',
    Component: null,
  },
  {
    key: 'permissions',
    label: 'Permisos por rol',
    icon: SlidersHorizontal,
    iconClass: 'text-blue-500',
    capability: 'manage_permissions',
    Component: null,
  },
  {
    key: 'markers',
    label: 'Marcadores (tamaños + estados)',
    icon: Ruler,
    iconClass: 'text-orange-500',
    capability: 'manage_marker_config',
    Component: MarkerSizeManager as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'routes',
    label: 'Motor de rutas',
    icon: RouteIcon,
    iconClass: 'text-primary',
    capability: 'manage_route_engine',
    Component: RouteSettingsPanelContent as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'icons',
    label: 'Galería de iconos',
    icon: Settings,
    iconClass: 'text-indigo-500',
    capability: 'manage_icon_library',
    Component: IconLibraryManager as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'enrichment',
    label: 'Estructura de fichas',
    icon: FileText,
    iconClass: 'text-emerald-500',
    capability: 'manage_enrichment_config',
    routeMode: 'route',
    Component: EnrichmentCardConfig as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'audit',
    label: 'Auditoría de preferencias',
    icon: ShieldAlert,
    iconClass: 'text-amber-500',
    capability: 'view_audit_log',
    routeMode: 'route',
    Component: AuditPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'geography',
    label: 'Mantenimiento geográfico (Admin)',
    icon: Compass,
    iconClass: 'text-amber-500',
    capability: 'view_geo_maintenance',
    routeMode: 'route',
    Component: GeographyBackfillPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'sources',
    label: 'Fuentes de datos',
    icon: Database,
    iconClass: 'text-cyan-500',
    capability: 'manage_data_sources',
    routeMode: 'route',
    Component: DataSourcesPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'image-recovery',
    label: 'Recuperar imágenes faltantes',
    icon: ImageIcon,
    iconClass: 'text-amber-500',
    capability: 'run_image_recovery',
    routeMode: 'route',
    Component: RecoverImagesPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'design-system',
    label: 'Design System Inspector',
    icon: Palette,
    iconClass: 'text-fuchsia-500',
    capability: 'manage_design_system',
    routeMode: 'route',
    Component: DesignSystemPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
  {
    key: 'internal-tools',
    label: 'Internal tooling',
    icon: Terminal,
    iconClass: 'text-slate-500',
    capability: 'run_internal_tooling',
    routeMode: 'route',
    Component: InternalToolsPanel as LazyExoticComponent<ComponentType<unknown>>,
  },
];

export function getAdminTab(key: AdminTabKey | undefined): AdminTabSpec | undefined {
  if (!key) return undefined;
  return ADMIN_TABS.find(t => t.key === key);
}

/** Resolución canónica de la URL `/admin/<key>` para un tab en routeMode='route'. */
export function getAdminTabPath(key: AdminTabKey): string {
  return `/admin/${key}`;
}

/** ¿Este tab vive en una ruta dedicada (no en el modal AdminPanel)? */
export function isRouteModeTab(spec: AdminTabSpec | undefined): boolean {
  return spec?.routeMode === 'route';
}
