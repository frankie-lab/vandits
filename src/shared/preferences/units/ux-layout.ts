/**
 * UX Layout unit — Nivel A (personal preference)
 * Grid density, card density, compact mode, sidebar persistence.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

export const UX_LAYOUT_UNIT: PreferenceUnit = {
  key: 'ux.layout',
  domain: 'ux',
  group: 'layout',
  name: 'Layout',
  description: 'Densidad, columnas y modo de presentación de la interfaz.',
  supportedScopes: ['system', 'user', 'device', 'session'],
  fields: [
    {
      key: 'density',
      label: 'Densidad',
      type: 'enum',
      defaultValue: 'comfortable',
      group: 'layout',
      enumOptions: [
        { value: 'compact', label: 'Compacto' },
        { value: 'comfortable', label: 'Confortable' },
        { value: 'spacious', label: 'Espacioso' },
      ],
    },
    {
      key: 'gridColumns',
      label: 'Columnas del grid',
      type: 'number',
      defaultValue: 3,
      min: 2,
      max: 6,
      step: 1,
      group: 'layout',
    },
    {
      key: 'cardDensity',
      label: 'Densidad de tarjetas',
      type: 'enum',
      defaultValue: 'default',
      group: 'layout',
      enumOptions: [
        { value: 'compact', label: 'Compacto' },
        { value: 'default', label: 'Normal' },
        { value: 'expanded', label: 'Expandido' },
      ],
    },
    {
      key: 'sidebarPersist',
      label: 'Sidebar persistente',
      type: 'boolean',
      defaultValue: true,
      group: 'layout',
      description: 'Mantener la barra lateral abierta entre sesiones',
    },
    {
      key: 'floatingPanelMode',
      label: 'Paneles flotantes',
      type: 'enum',
      defaultValue: 'floating',
      group: 'layout',
      enumOptions: [
        { value: 'floating', label: 'Flotante' },
        { value: 'docked', label: 'Anclado' },
      ],
    },
  ],
};

registerUnit(UX_LAYOUT_UNIT);
