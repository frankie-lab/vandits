/**
 * UX Accessibility unit — Nivel A (personal preference)
 * Motion reduction, large targets, keyboard shortcuts.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

export const UX_ACCESSIBILITY_UNIT: PreferenceUnit = {
  key: 'ux.accessibility',
  domain: 'ux',
  group: 'accessibility',
  name: 'Accesibilidad',
  description: 'Opciones de accesibilidad: movimiento reducido, targets amplios.',
  supportedScopes: ['system', 'user', 'device'],
  fields: [
    {
      key: 'reduceMotion',
      label: 'Reducir movimiento',
      type: 'boolean',
      defaultValue: false,
      group: 'accessibility',
      description: 'Desactiva animaciones y transiciones',
    },
    {
      key: 'largeTargets',
      label: 'Áreas de toque amplias',
      type: 'boolean',
      defaultValue: false,
      group: 'accessibility',
      description: 'Aumentar tamaño de botones e interactivos',
    },
    {
      key: 'showKeyboardShortcuts',
      label: 'Mostrar atajos de teclado',
      type: 'boolean',
      defaultValue: false,
      group: 'accessibility',
    },
  ],
};

registerUnit(UX_ACCESSIBILITY_UNIT);
