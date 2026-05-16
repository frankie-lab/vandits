/**
 * P-POPUP-2 — Contract tests for the canonical geo header helper.
 * Pure-function tests (no DOM, no React, no Leaflet).
 */
import { describe, it, expect } from 'vitest';
import {
  getCanonicalGeoChips,
  buildGeoHeaderHtml,
} from '@/shared/popup/geo-header';
import type { GeoLocation } from '@/types/location';

function makeLoc(partial: Record<string, any>): GeoLocation {
  return {
    id: 'test',
    name: 'Test',
    coordinates: { lat: 0, lng: 0 },
    ...partial,
  } as unknown as GeoLocation;
}

describe('P-POPUP-2 — canonical geo header', () => {
  it('emits chips in order locality → zone → region → country', () => {
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Albarracín',
          admin_nivel_2: 'Teruel',
          admin_nivel_1: 'Aragón',
          pais: 'España',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    expect(chips.map(c => c.level)).toEqual(['locality', 'zone', 'region', 'country']);
    expect(chips.map(c => c.value)).toEqual(['Albarracín', 'Teruel', 'Aragón', 'Spain']);
  });

  it('omits placeholders like "(sin provincia)" silently', () => {
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Foo',
          admin_nivel_2: '(sin provincia)',
          admin_nivel_1: 'Aragón',
          pais: 'España',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    expect(chips.find(c => c.level === 'zone')).toBeUndefined();
    expect(chips.map(c => c.level)).toEqual(['locality', 'region', 'country']);
  });

  it('canonicalises country alias (España → Spain, canonical EN form)', () => {
    const loc = makeLoc({
      enrichedData: { datos_geograficos: { pais: 'España' } },
    });
    const chips = getCanonicalGeoChips(loc);
    expect(chips.find(c => c.level === 'country')?.value).toBe('Spain');
  });

  it('emits .filter-link only for zone/region/country (locality stays static)', () => {
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Madrid',
          admin_nivel_2: 'Madrid',
          admin_nivel_1: 'Comunidad de Madrid',
          pais: 'España',
        },
      },
    });
    const html = buildGeoHeaderHtml(loc, { background: 'BG', foreground: 'FG' });
    // Locality (Madrid) gets deduped against zone (same value, lowercase).
    // The first occurrence (locality) wins → no filter-link for Madrid.
    expect(html).toContain('data-geo-level="locality"');
    expect(html).toContain('data-geo-level="region"');
    expect(html).toContain('data-geo-level="country"');
    // region + country emit .filter-link
    expect(html).toMatch(/class="filter-link"[^>]*data-filter-type="region"/);
    expect(html).toMatch(/class="filter-link"[^>]*data-filter-type="country"/);
  });

  it('returns empty string when no geo data is present', () => {
    const loc = makeLoc({ enrichedData: {} });
    expect(buildGeoHeaderHtml(loc, { background: 'BG', foreground: 'FG' })).toBe('');
  });

  it('escapes user-controllable values in HTML attributes', () => {
    const loc = makeLoc({
      enrichedData: { datos_geograficos: { localidad: 'Foo "x"<y>' } },
    });
    const html = buildGeoHeaderHtml(loc, { background: 'BG', foreground: 'FG' });
    expect(html).not.toContain('<y>');
    expect(html).toContain('&quot;');
  });

  it('dedupes same-value locality and zone (Madrid/Madrid)', () => {
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Madrid',
          admin_nivel_2: 'Madrid',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    expect(chips).toHaveLength(1);
    expect(chips[0].level).toBe('locality');
  });

  it('confirms ZONE is rendered BETWEEN locality and region (semantic spec)', () => {
    // Documents the explicit P-POPUP-2 decision: zone = PROVINCIA, sits
    // between locality and region in the canonical 8-level tree.
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Albarracín',
          admin_nivel_2: 'Teruel',
          admin_nivel_1: 'Aragón',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    const idxLoc = chips.findIndex(c => c.level === 'locality');
    const idxZone = chips.findIndex(c => c.level === 'zone');
    const idxRegion = chips.findIndex(c => c.level === 'region');
    expect(idxLoc).toBeLessThan(idxZone);
    expect(idxZone).toBeLessThan(idxRegion);
  });

  it('P2-FIX-D — dedupes zone==region for uniprovincial communities (Asturias)', () => {
    // Real-world payload from preview: Principado de Asturias is uniprovincial
    // (admin_nivel_1 === admin_nivel_2). Must collapse to a single chip and
    // never emit continent in the header.
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          admin_nivel_2: 'Principado de Asturias',
          admin_nivel_1: 'Principado de Asturias',
          pais: 'España',
          continente: 'Europa',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    expect(chips.map(c => c.value)).toEqual(['Principado de Asturias', 'Spain']);
    // First occurrence (zone) wins per the dedupe contract.
    expect(chips[0].level).toBe('zone');
    expect(chips.find(c => (c as any).level === 'continent')).toBeUndefined();
  });

  it('P2-FIX-D — dedupes zone==region for Madrid uniprovincial', () => {
    const loc = makeLoc({
      enrichedData: {
        datos_geograficos: {
          localidad: 'Madrid',
          admin_nivel_2: 'Madrid',
          admin_nivel_1: 'Comunidad de Madrid',
          pais: 'España',
        },
      },
    });
    const chips = getCanonicalGeoChips(loc);
    // locality "Madrid" dedupes zone "Madrid"; region "Comunidad de Madrid"
    // is a different slug and survives.
    expect(chips.map(c => c.value)).toEqual([
      'Madrid', 'Comunidad de Madrid', 'Spain',
    ]);
  });
});
