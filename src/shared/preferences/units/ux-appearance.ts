/**
 * UX Appearance unit — Nivel A (personal preference)
 * Theme, accent color, contrast, border radius, motion level.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

export const UX_APPEARANCE_UNIT: PreferenceUnit = {
  key: 'ux.appearance',
  domain: 'ux',
  group: 'appearance',
  name: 'Apariencia',
  description: 'Tema, colores, contraste y animaciones de la interfaz.',
  supportedScopes: ['system', 'user', 'device', 'session'],
  fields: [
    {
      key: 'theme',
      label: 'Tema',
      type: 'enum',
      defaultValue: 'light',
      group: 'appearance',
      enumOptions: [
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' },
        { value: 'auto', label: 'Automático' },
      ],
    },
    {
      key: 'accentColor',
      label: 'Color de acento',
      type: 'color',
      defaultValue: '#e68a2e',
      group: 'appearance',
      description: 'Color principal de la interfaz',
    },
    {
      key: 'contrast',
      label: 'Contraste',
      type: 'enum',
      defaultValue: 'normal',
      group: 'appearance',
      enumOptions: [
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'Alto' },
      ],
    },
    {
      key: 'radius',
      label: 'Bordes',
      type: 'enum',
      defaultValue: 'md',
      group: 'appearance',
      enumOptions: [
        { value: 'none', label: 'Sin redondeo' },
        { value: 'sm', label: 'Sutil' },
        { value: 'md', label: 'Medio' },
        { value: 'lg', label: 'Redondeado' },
      ],
    },
    {
      key: 'motionLevel',
      label: 'Animaciones',
      type: 'enum',
      defaultValue: 'full',
      group: 'appearance',
      enumOptions: [
        { value: 'full', label: 'Completas' },
        { value: 'reduced', label: 'Reducidas' },
        { value: 'none', label: 'Desactivadas' },
      ],
    },
  ],
};

registerUnit(UX_APPEARANCE_UNIT);
