/**
 * UX Audio unit — Nivel A (personal preference)
 * Absorbs use-sound-preferences.ts into the preference system.
 */
import { registerUnit } from '@/shared/preferences';
import type { PreferenceUnit } from '@/shared/preferences';

export const UX_AUDIO_UNIT: PreferenceUnit = {
  key: 'ux.audio',
  domain: 'ux',
  group: 'appearance',
  name: 'Audio',
  description: 'Sonidos de notificación y feedback auditivo.',
  supportedScopes: ['system', 'user', 'device', 'session'],
  fields: [
    {
      key: 'globalEnabled',
      label: 'Sonidos activados',
      type: 'boolean',
      defaultValue: true,
      group: 'appearance',
      description: 'Interruptor maestro de sonidos',
    },
    {
      key: 'enrichmentSound',
      label: 'Enriquecimiento IA',
      type: 'boolean',
      defaultValue: true,
      group: 'appearance',
    },
    {
      key: 'importSound',
      label: 'Importación de archivos',
      type: 'boolean',
      defaultValue: true,
      group: 'appearance',
    },
    {
      key: 'exportSound',
      label: 'Exportación',
      type: 'boolean',
      defaultValue: true,
      group: 'appearance',
    },
    {
      key: 'routeSound',
      label: 'Ruta calculada',
      type: 'boolean',
      defaultValue: true,
      group: 'appearance',
    },
  ],
};

registerUnit(UX_AUDIO_UNIT);
