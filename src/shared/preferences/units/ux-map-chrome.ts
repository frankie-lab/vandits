/**
 * UX Map Chrome unit — Nivel A (personal preference)
 * Map UI elements that don't affect semantic rendering.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

export const UX_MAP_CHROME_UNIT: PreferenceUnit = {
  key: 'ux.map.chrome',
  domain: 'ux',
  group: 'map',
  name: 'Mapa — Chrome',
  description: 'Elementos de la interfaz del mapa: escala, leyenda, toolbar.',
  supportedScopes: ['system', 'user', 'session'],
  fields: [
    {
      key: 'showScale',
      label: 'Mostrar escala',
      type: 'boolean',
      defaultValue: true,
      group: 'map',
    },
    {
      key: 'showMiniLegend',
      label: 'Mini leyenda',
      type: 'boolean',
      defaultValue: true,
      group: 'map',
      description: 'Mostrar leyenda minimizada en el mapa',
    },
    {
      key: 'toolbarPosition',
      label: 'Posición del toolbar',
      type: 'enum',
      defaultValue: 'top',
      group: 'map',
      enumOptions: [
        { value: 'top', label: 'Arriba' },
        { value: 'bottom', label: 'Abajo' },
      ],
    },
  ],
};

registerUnit(UX_MAP_CHROME_UNIT);

export const UX_MAP_INTERACTION_UNIT: PreferenceUnit = {
  key: 'ux.map.interaction',
  domain: 'ux',
  group: 'map',
  name: 'Mapa — Interacción',
  description: 'Comportamiento de interacción con el mapa.',
  supportedScopes: ['system', 'user', 'session'],
  fields: [
    {
      key: 'hoverPreview',
      label: 'Vista previa al pasar',
      type: 'boolean',
      defaultValue: true,
      group: 'map',
      description: 'Mostrar tooltip al pasar el cursor sobre un marcador',
    },
    {
      key: 'clickBehavior',
      label: 'Comportamiento del click',
      type: 'enum',
      defaultValue: 'popup',
      group: 'map',
      enumOptions: [
        { value: 'popup', label: 'Popup' },
        { value: 'sidebar', label: 'Barra lateral' },
      ],
    },
  ],
};

registerUnit(UX_MAP_INTERACTION_UNIT);
