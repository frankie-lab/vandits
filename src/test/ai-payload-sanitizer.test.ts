// Contract tests for Fase 4 (R4 + R5) — AI enrichment payload sanitizer.
// See `docs/contracts/enrichment-coord-coherence-contract.md`.

import { describe, it, expect } from 'vitest';
import {
  sanitizeAiEnrichmentPayload,
  PROHIBITED_AI_GEO_FIELDS,
  PROHIBITED_PLACEHOLDER_RE,
} from '@/shared/enrichment/ai-payload-sanitizer';

describe('sanitizeAiEnrichmentPayload — R4: prohibited geo fields', () => {
  it('strips all prohibited fields from datos_geograficos and keeps allowed ones', () => {
    const input = {
      descripcion: 'Texto válido.',
      datos_geograficos: {
        coordenadas: '40.0, -3.0',
        pais: 'España',
        continente: 'Europa',
        admin_nivel_1: 'Madrid',
        admin_nivel_2: 'Madrid',
        admin_nivel_3: 'Madrid',
        localidad: 'Madrid',
        sublocalidad: 'Centro',
        lugar_interes: 'Plaza Mayor',
        direccion_postal: 'Plaza Mayor s/n, 28012 Madrid',
      },
    };

    const { sanitized, report } = sanitizeAiEnrichmentPayload(input) as {
      sanitized: { datos_geograficos: Record<string, unknown> };
      report: { removedGeoFields: string[] };
    };

    expect(report.removedGeoFields.sort()).toEqual([...PROHIBITED_AI_GEO_FIELDS].sort());
    expect(sanitized.datos_geograficos).toEqual({
      lugar_interes: 'Plaza Mayor',
      direccion_postal: 'Plaza Mayor s/n, 28012 Madrid',
    });
  });

  it('does not mutate the input payload', () => {
    const input = {
      datos_geograficos: { pais: 'España', lugar_interes: 'X' },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeAiEnrichmentPayload(input);
    expect(input).toEqual(snapshot);
  });
});

describe('sanitizeAiEnrichmentPayload — R5: placeholders', () => {
  it('strips "(sin región)" / "(sin provincia)" / "(sin comarca)" / "(sin localidad)" everywhere', () => {
    const input = {
      descripcion: 'Texto editorial',
      datos_clave: {
        tipo: '(sin región)',
        acceso: 'Libre',
      },
      etiquetas: ['#Plaza', '(sin provincia)', '#Madrid'],
      datos_geograficos: {
        lugar_interes: 'Plaza',
        direccion_postal: '(sin comarca)',
      },
      observaciones: '(SIN LOCALIDAD)',
    };

    const { sanitized, report } = sanitizeAiEnrichmentPayload(input) as {
      sanitized: any;
      report: { removedPlaceholders: Array<{ path: string; value: string }> };
    };

    expect(sanitized.datos_clave).toEqual({ acceso: 'Libre' });
    expect(sanitized.etiquetas).toEqual(['#Plaza', '#Madrid']);
    expect(sanitized.datos_geograficos).toEqual({ lugar_interes: 'Plaza' });
    expect(sanitized).not.toHaveProperty('observaciones');

    const paths = report.removedPlaceholders.map((p) => p.path).sort();
    expect(paths).toEqual([
      'datos_clave.tipo',
      'datos_geograficos.direccion_postal',
      'etiquetas[1]',
      'observaciones',
    ]);
  });

  it('does NOT strip placeholder-like substrings inside longer text', () => {
    const input = {
      descripcion: 'La plaza (sin región) es famosa por…', // substring, not full match
    };
    const { sanitized, report } = sanitizeAiEnrichmentPayload(input) as {
      sanitized: { descripcion: string };
      report: { removedPlaceholders: unknown[] };
    };
    expect(sanitized.descripcion).toBe(input.descripcion);
    expect(report.removedPlaceholders).toHaveLength(0);
  });

  it('regex contract — matches only exact placeholders', () => {
    expect(PROHIBITED_PLACEHOLDER_RE.test('(sin región)')).toBe(true);
    expect(PROHIBITED_PLACEHOLDER_RE.test('  ( SIN provincia )  ')).toBe(true);
    expect(PROHIBITED_PLACEHOLDER_RE.test('(sin comarca)')).toBe(true);
    expect(PROHIBITED_PLACEHOLDER_RE.test('(sin localidad)')).toBe(true);
    expect(PROHIBITED_PLACEHOLDER_RE.test('foo (sin región) bar')).toBe(false);
    expect(PROHIBITED_PLACEHOLDER_RE.test('sin región')).toBe(false);
    expect(PROHIBITED_PLACEHOLDER_RE.test('(con región)')).toBe(false);
  });
});

describe('sanitizeAiEnrichmentPayload — pass-through behaviour', () => {
  it('returns valid editorial payloads unchanged (deep equal)', () => {
    const input = {
      verified: true,
      descripcion: 'Texto largo y verificado.',
      datos_clave: {
        tipo: 'Plaza histórica',
        acceso: 'Libre',
        web_referencia: 'https://example.org',
      },
      etiquetas: ['#Plaza', '#Madrid', '#Centro'],
      datos_geograficos: {
        lugar_interes: 'Plaza Mayor',
        direccion_postal: 'Plaza Mayor s/n, 28012 Madrid',
      },
      indice_interes: 5,
    };

    const { sanitized, report } = sanitizeAiEnrichmentPayload(input);
    expect(sanitized).toEqual(input);
    expect(report.removedGeoFields).toHaveLength(0);
    expect(report.removedPlaceholders).toHaveLength(0);
  });

  it('handles null / undefined / non-object inputs without throwing', () => {
    for (const value of [null, undefined, 42, 'string', [1, 2, 3]]) {
      const { sanitized, report } = sanitizeAiEnrichmentPayload(value as unknown);
      expect(sanitized).toBe(value);
      expect(report.removedGeoFields).toHaveLength(0);
      expect(report.removedPlaceholders).toHaveLength(0);
    }
  });

  it('PROHIBITED_AI_GEO_FIELDS catalog matches contract (8 fields)', () => {
    expect([...PROHIBITED_AI_GEO_FIELDS].sort()).toEqual([
      'admin_nivel_1',
      'admin_nivel_2',
      'admin_nivel_3',
      'continente',
      'coordenadas',
      'localidad',
      'pais',
      'sublocalidad',
    ]);
  });
});
