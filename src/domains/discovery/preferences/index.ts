/**
 * Discovery domain — preference unit registrations.
 *
 * Only layer visibility is a UX preference (Nivel A).
 * Marker sizes and marker state rules are semantic V2 config (Nivel B)
 * managed via app_settings + admin panel — NOT part of the UX preference system.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

// ── Layer Visibility (Nivel A — UX preference) ──────────────
export const LAYER_VISIBILITY_UNIT: PreferenceUnit = {
  key: 'ux.map.visibility',
  domain: 'discovery',
  group: 'map',
  name: 'Visibilidad de capas',
  description: 'Controla qué capas de puntos y rutas se muestran en el mapa.',
  supportedScopes: ['system', 'user', 'session'],
  fields: [
    { key: 'ownVisible', label: 'Mis puntos', type: 'boolean', defaultValue: true, group: 'map' },
    { key: 'catalogVisible', label: 'Catálogo', type: 'boolean', defaultValue: true, group: 'map' },
    { key: 'workspaceVisible', label: 'Mesa de trabajo', type: 'boolean', defaultValue: false, group: 'map' },
    { key: 'followedVisible', label: 'Seguidos', type: 'boolean', defaultValue: true, group: 'map' },
    { key: 'routesVisible', label: 'Rutas', type: 'boolean', defaultValue: true, group: 'map' },
    { key: 'pointsVisible', label: 'Todos los puntos', type: 'boolean', defaultValue: true, group: 'map', description: 'Interruptor maestro para puntos' },
    { key: 'followedEntityHidden', label: 'Usuarios seguidos ocultos', type: 'json', defaultValue: [], hidden: true, group: 'map' },
  ],
};

registerUnit(LAYER_VISIBILITY_UNIT);

/**
 * NOTE: marker_sizes and marker_state_rules are intentionally NOT registered
 * as preference units. They are Nivel B (semantic V2 config) and remain
 * managed via the app_settings table + Back Office admin panel.
 * See ADR-001 for the boundary between Nivel A and Nivel B.
 */
