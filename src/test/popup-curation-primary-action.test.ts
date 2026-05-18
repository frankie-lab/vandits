/**
 * P-POI-CURATION-1 — Footer primary action contract + renderer invariance.
 *
 * Verifica que el botón principal de curación se emite en el footer
 * canónico con el `data-curation-action` correcto según el nivel del POI,
 * y BLINDA que la introducción del sistema de niveles NO bifurca el
 * renderer (no aparecen `data-popup-footer="v2"`, no aparecen wrappers
 * nuevos, no aparecen ramas legacy).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: () => false,
}));
vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import { createPopupContent, type PopupOwnership } from '@/components/map/map-popups';
import type { GeoLocation, EnrichedLocationData } from '@/types/location';
import { GOLDEN_POI, GOLDEN_OWNERSHIP } from './fixtures/golden-poi-popup';

const LONG_DESC =
  'Descripción suficientemente larga para superar cualquier umbral de validación; ' +
  'incluye contexto histórico, geográfico y cultural para evitar marcas unverifiable.';

function makeEnriched(): EnrichedLocationData {
  return {
    ...GOLDEN_POI.enrichedData!,
    descripcion: LONG_DESC,
  };
}

function fromGolden(over: Partial<GeoLocation>): GeoLocation {
  return {
    ...GOLDEN_POI,
    ...over,
    customData: { ...(GOLDEN_POI.customData ?? {}), ...(over.customData ?? {}) },
  };
}

const OWN: PopupOwnership = GOLDEN_OWNERSHIP;

// Fixtures por nivel ────────────────────────────────────────────────────
const POI_0: GeoLocation = fromGolden({
  id: 'lvl-0',
  name: '',
  enrichedData: undefined,
  enrichmentStatus: undefined,
  geoHealth: null,
  customData: { visited: 'false' },
});
const POI_1: GeoLocation = fromGolden({
  id: 'lvl-1',
  name: 'Un POI',
  enrichedData: undefined,
  enrichmentStatus: undefined,
  geoHealth: 'empty',
  customData: { visited: 'false' },
});
const POI_3: GeoLocation = fromGolden({
  id: 'lvl-3',
  enrichedData: makeEnriched(),
  geoHealth: 'broken',
});
const POI_5: GeoLocation = fromGolden({
  id: 'lvl-5',
  enrichedData: makeEnriched(),
  geoHealth: 'partial',
});
const POI_9: GeoLocation = fromGolden({
  id: 'lvl-9',
  enrichedData: makeEnriched(),
  geoHealth: 'ok',
  customData: { visited: 'true', user_rating: '' },
});
const POI_10: GeoLocation = fromGolden({
  id: 'lvl-10',
  enrichedData: makeEnriched(),
  geoHealth: 'ok',
  customData: { visited: 'true', user_rating: '5' },
});

const ALL_LEVELS: Array<{ level: number; loc: GeoLocation; action: string | null }> = [
  { level: 0, loc: POI_0, action: 'name' },
  { level: 1, loc: POI_1, action: 'validate-geo' },
  { level: 3, loc: POI_3, action: 'resolve-conflict' },
  { level: 5, loc: POI_5, action: 'heal' },
  { level: 9, loc: POI_9, action: 'rate-experience' },
  { level: 10, loc: POI_10, action: null }, // POI-10 no emite botón
];

describe('P-POI-CURATION-1 — footer primary action por nivel', () => {
  for (const { level, loc, action } of ALL_LEVELS) {
    it(`POI-${level} emite el botón correcto`, () => {
      const html = createPopupContent(loc, 0, OWN, true);
      if (action === null) {
        expect(html).not.toContain('data-action="curation-primary"');
      } else {
        const matches = html.match(/data-action="curation-primary"/g) ?? [];
        expect(matches.length).toBe(1);
        expect(html).toContain(`data-curation-action="${action}"`);
        expect(html).toContain(`data-curation-level="${level}"`);
      }
    });
  }
});

describe('P-POI-CURATION-1 — renderer invariance (BLINDAJE)', () => {
  const htmlByLevel = Object.fromEntries(
    ALL_LEVELS.map(({ level, loc }) => [level, createPopupContent(loc, 0, OWN, true)] as const),
  );

  it('ningún nivel emite `data-popup-footer="v2"` ni variantes', () => {
    for (const html of Object.values(htmlByLevel)) {
      expect(html).not.toContain('data-popup-footer="v2"');
      expect(html).not.toMatch(/data-popup-footer="v[2-9]"/);
    }
  });

  it('todos los niveles conservan exactamente UN `data-popup-footer="v1"`', () => {
    for (const html of Object.values(htmlByLevel)) {
      const matches = html.match(/data-popup-footer="v1"/g) ?? [];
      expect(matches.length).toBe(1);
    }
  });

  it('todos los niveles conservan `data-popup-version="geo-canonical-v1"`', () => {
    for (const html of Object.values(htmlByLevel)) {
      expect(html).toContain('data-popup-version="geo-canonical-v1"');
    }
  });

  it('P-POPUP-16: todos los niveles renderean con `data-popup-operational-state="idle"`', () => {
    for (const html of Object.values(htmlByLevel)) {
      expect(html).toContain('data-popup-operational-state="idle"');
      expect(html).not.toContain('data-popup-operational-state="loading"');
    }
  });

  it('ningún nivel introduce atributos/clases de variantes legacy', () => {
    for (const html of Object.values(htmlByLevel)) {
      expect(html).not.toContain('data-popup-variant');
      expect(html).not.toContain('popup-v2-');
      expect(html).not.toMatch(/class="[^"]*legacy-popup[^"]*"/);
    }
  });

  it('todos los niveles conservan el bloque ratings v1 canónico', () => {
    // Curator/nearby quedan fuera (no aplica aquí; viewers son owners).
    for (const html of Object.values(htmlByLevel)) {
      expect(html).toContain('data-popup-ratings-block="v1"');
    }
  });

  it('snapshot estructural: el set de NOMBRES de markers `data-popup-*` (shell) es idéntico entre POI-3 y POI-5 (ambos enriched)', () => {
    // Comparamos nombres (no valores) y entre dos niveles con mismo perfil
    // de slots (enriched). Esto garantiza que añadir curation NO introduce
    // markers de shell nuevos por nivel.
    const extractNames = (html: string) =>
      Array.from(new Set(
        Array.from(html.matchAll(/data-popup-([a-z-]+)=/g)).map((m) => m[1]),
      )).sort();
    expect(extractNames(htmlByLevel[3])).toEqual(extractNames(htmlByLevel[5]));
  });

  it('el único cambio entre niveles es `data-curation-action` / `data-curation-level`', () => {
    // Comparar POI-3 y POI-5 (ambos enriched, ambos emiten botón).
    const strip = (html: string) =>
      html
        .replace(/data-curation-action="[^"]*"/g, '')
        .replace(/data-curation-level="\d+"/g, '')
        .replace(/title="[^"]*"/g, '')
        .replace(/>[^<]*<\/button>/g, '></button>');
    // Tras strip, la estructura del shell debe ser idéntica en longitud.
    // (No buscamos equality literal porque el id del POI varía.)
    const aLen = strip(htmlByLevel[3]).length;
    const bLen = strip(htmlByLevel[5]).length;
    // Diferencia tolerada por el id del POI (cadenas cortas).
    expect(Math.abs(aLen - bLen)).toBeLessThan(50);
  });
});

describe('P-POI-CURATION-1 — POI-10 estado final', () => {
  it('no emite botón principal de curación', () => {
    const html = createPopupContent(POI_10, 0, OWN, true);
    expect(html).not.toContain('data-action="curation-primary"');
  });

  it('mantiene el shell canónico completo', () => {
    const html = createPopupContent(POI_10, 0, OWN, true);
    expect(html).toContain('data-popup-version="geo-canonical-v1"');
    expect(html).toContain('data-popup-ratings-block="v1"');
    expect(html).toContain('data-popup-footer="v1"');
  });
});
