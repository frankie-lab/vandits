import { describe, it, expect } from 'vitest';
import {
  getPointVisualState,
  isPointEnriched,
  visualStateToConfigKey,
  getPointConfigKey,
} from '@/domains/content/lib/point-visual-state';
import type { EnrichableLocation } from '@/domains/content/lib/enrichment-state';

describe('point-visual-state — gramática visual de puntos', () => {
  describe('getPointVisualState', () => {
    it('null → empty', () => {
      expect(getPointVisualState(null)).toBe('empty');
    });

    it('undefined → empty', () => {
      expect(getPointVisualState(undefined)).toBe('empty');
    });

    it('sin description ni enriched_data.descripcion → empty', () => {
      const loc: EnrichableLocation = {};
      expect(getPointVisualState(loc)).toBe('empty');
    });

    it('description vacía/whitespace → empty', () => {
      expect(getPointVisualState({ description: '   ' })).toBe('empty');
    });

    it('enriched_data presente pero descripcion vacía → empty', () => {
      const loc: EnrichableLocation = { enriched_data: { descripcion: '' } };
      expect(getPointVisualState(loc)).toBe('empty');
    });

    it('description sin enriquecimiento IA → imported', () => {
      const loc: EnrichableLocation = { description: 'Texto importado plano' };
      expect(getPointVisualState(loc)).toBe('imported');
    });

    it('enriched_data.descripcion real (snake_case) → enriched', () => {
      const loc: EnrichableLocation = {
        description: 'algo',
        enriched_data: {
          descripcion:
            'Castillo medieval del siglo XII situado sobre una roca caliza, con torre del homenaje cuadrada y patio de armas restaurado en el siglo XIX.',
        },
      };
      expect(getPointVisualState(loc)).toBe('enriched');
    });

    it('enrichedData.descripcion real (camelCase) → enriched', () => {
      const loc: EnrichableLocation = {
        enrichedData: {
          descripcion:
            'Iglesia románica del siglo XI con ábside semicircular decorado con arquillos lombardos y portada sur de tres arquivoltas sobre columnas.',
        },
      };
      expect(getPointVisualState(loc)).toBe('enriched');
    });
  });

  describe('isPointEnriched', () => {
    it('true solo cuando hay enriquecimiento IA real', () => {
      expect(isPointEnriched(null)).toBe(false);
      expect(isPointEnriched(undefined)).toBe(false);
      expect(isPointEnriched({})).toBe(false);
      expect(isPointEnriched({ description: 'texto importado' })).toBe(false);
      expect(isPointEnriched({ enriched_data: { descripcion: '' } })).toBe(false);
      expect(
        isPointEnriched({
          enriched_data: {
            descripcion:
              'Monasterio cisterciense fundado en el siglo XII con claustro de planta cuadrada, sala capitular abovedada y refectorio de dos naves.',
          },
        }),
      ).toBe(true);
    });
  });

  describe('visualStateToConfigKey', () => {
    it('mapea cada estado a su clave de config homónima', () => {
      expect(visualStateToConfigKey('enriched')).toBe('enriched');
      expect(visualStateToConfigKey('imported')).toBe('imported');
      expect(visualStateToConfigKey('empty')).toBe('empty');
    });
  });

  describe('getPointConfigKey', () => {
    it('coincide con getPointVisualState para los tres buckets', () => {
      const empty: EnrichableLocation = {};
      const imported: EnrichableLocation = { description: 'importado' };
      const enriched: EnrichableLocation = {
        enriched_data: {
          descripcion:
            'Monasterio cisterciense del siglo XIII con claustro de planta cuadrada y sala capitular abovedada sobre columnas centrales.',
        },
      };

      for (const loc of [empty, imported, enriched, null, undefined] as const) {
        expect(getPointConfigKey(loc)).toBe(getPointVisualState(loc));
      }
    });
  });
});
