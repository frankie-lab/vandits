/**
 * Discovery domain — preference unit registrations.
 *
 * Each unit is registered at module load time so it's available
 * to any consumer that imports this module.
 */
import { registerUnit } from '@/shared/preferences';
import type { ManageableUnit } from '@/shared/preferences';

// ── Layer Visibility ─────────────────────────────────────────
export const LAYER_VISIBILITY_UNIT: ManageableUnit = {
  id: 'discovery.map.layer_visibility',
  domain: 'discovery',
  name: 'Visibilidad de capas',
  description: 'Controla qué capas de puntos y rutas se muestran en el mapa.',
  supportedScopes: ['system', 'user', 'session'],
  fields: [
    { key: 'ownVisible', label: 'Mis puntos', type: 'boolean', defaultValue: true },
    { key: 'catalogVisible', label: 'Catálogo', type: 'boolean', defaultValue: true },
    { key: 'workspaceVisible', label: 'Mesa de trabajo', type: 'boolean', defaultValue: false },
    { key: 'followedVisible', label: 'Seguidos', type: 'boolean', defaultValue: true },
    { key: 'routesVisible', label: 'Rutas', type: 'boolean', defaultValue: true },
    { key: 'pointsVisible', label: 'Todos los puntos', type: 'boolean', defaultValue: true, description: 'Interruptor maestro para puntos' },
    // Entity-hidden arrays are managed via custom UI, not the generic panel
    { key: 'followedEntityHidden', label: 'Usuarios seguidos ocultos', type: 'json', defaultValue: [], hidden: true },
  ],
};

registerUnit(LAYER_VISIBILITY_UNIT);

// Future: marker_sizes, marker_state_rules, etc.
