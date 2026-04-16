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
    { key: 'followedEntityHidden', label: 'Usuarios seguidos ocultos', type: 'json', defaultValue: [], hidden: true },
  ],
};

registerUnit(LAYER_VISIBILITY_UNIT);

// ── Marker Sizes ─────────────────────────────────────────────
export const MARKER_SIZES_UNIT: ManageableUnit = {
  id: 'discovery.map.marker_sizes',
  domain: 'discovery',
  name: 'Tamaños de marcadores',
  description: 'Tamaños base y formas para cada tipo de marcador en el mapa.',
  supportedScopes: ['system', 'domain'],
  customPanelId: 'marker-size-manager',
  fields: [
    // Managed via the dedicated MarkerSizeManager panel (custom UI)
    { key: 'config', label: 'Configuración de tamaños', type: 'json', defaultValue: {}, hidden: true },
  ],
};

registerUnit(MARKER_SIZES_UNIT);

// ── Marker State Rules ───────────────────────────────────────
export const MARKER_STATE_RULES_UNIT: ManageableUnit = {
  id: 'discovery.map.marker_state_rules',
  domain: 'discovery',
  name: 'Norma de estados',
  description: 'Reglas de color, sombra y borde para estados hover, selected, focused y recent.',
  supportedScopes: ['system', 'domain'],
  customPanelId: 'marker-state-rules-panel',
  fields: [
    { key: 'accentColor', label: 'Color de acento', type: 'color', defaultValue: '#3b82f6' },
    { key: 'selectionColor', label: 'Color de selección', type: 'color', defaultValue: '#f59e0b' },
    { key: 'hoverMixPercent', label: 'Hover — mezcla (%)', type: 'number', defaultValue: 25, min: 0, max: 100 },
    { key: 'hoverShadowBlur', label: 'Hover — desenfoque sombra', type: 'number', defaultValue: 8, min: 0, max: 30 },
    { key: 'hoverShadowOpacity', label: 'Hover — opacidad sombra', type: 'number', defaultValue: 0.3, min: 0, max: 1, step: 0.05 },
    { key: 'hoverBorderWidth', label: 'Hover — grosor borde', type: 'number', defaultValue: 2, min: 0, max: 5, step: 0.5 },
    { key: 'selectedMixPercent', label: 'Selected — mezcla (%)', type: 'number', defaultValue: 15, min: 0, max: 100 },
    { key: 'focusedMixPercent', label: 'Focused — mezcla (%)', type: 'number', defaultValue: 30, min: 0, max: 100 },
    { key: 'recentMixPercent', label: 'Recent — mezcla (%)', type: 'number', defaultValue: 20, min: 0, max: 100 },
    // Full rules stored as JSON for custom panel
    { key: 'rules', label: 'Reglas completas', type: 'json', defaultValue: {}, hidden: true },
  ],
};

registerUnit(MARKER_STATE_RULES_UNIT);
