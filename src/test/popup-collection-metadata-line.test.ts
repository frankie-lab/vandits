/**
 * P-POPUP-4E — collections en la línea metadata (no chips/hashtags)
 *
 * Garantiza:
 *  - Las colecciones del POI se renderizan inline en la línea metadata
 *    (junto a la fecha), con icono Lucide `bookmark` + nombre legible.
 *  - Sin pill/chip/hashtag/color de colección.
 *  - Máx 2 inline; del 3º en adelante "+N" con `title` listando los nombres.
 *  - Orden: fecha · colección(es) · vía <provenance>.
 *  - `vía …` queda reservado a provenance/source externo.
 *  - `buildCollectionChipsPlaceholder` ya NO inyecta DOM (no-op).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GeoLocation } from '@/types/location';

const __map = new Map<string, Array<{ id: string; name: string; color: string | null; icon: string | null }>>();
function __setCollections(locId: string, items: Array<{ id: string; name: string }>) {
  __map.set(locId, items.map((i) => ({ id: i.id, name: i.name, color: null, icon: null })));
}
function __reset() { __map.clear(); }

vi.mock('@/domains/content/store/location-collections-store', () => ({
  getCollectionsForLocation: (id: string) => __map.get(id) ?? [],
  primeCollectionsForLocations: () => {},
  subscribeLocationCollections: () => () => {},
}));

import {
  buildCollectionsMetadataSegment,
  buildCollectionChipsPlaceholder,
  buildOwnAddedLineHtml,
  buildOwnEnrichedMetadataLineHtml,
} from '@/components/map/map-popups';

function poi(id: string, extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id,
    name: id,
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date('2026-05-05T10:00:00Z'),
    updatedAt: new Date('2026-05-05T10:00:00Z'),
    ...extra,
  } as unknown as GeoLocation;
}

beforeEach(() => __reset());

describe('P-POPUP-4E — buildCollectionsMetadataSegment', () => {
  it('devuelve "" si el POI no tiene colecciones', () => {
    expect(buildCollectionsMetadataSegment(poi('p0'))).toBe('');
  });

  it('renderiza nombre legible (no slug) con icono bookmark', () => {
    __setCollections('p1', [{ id: 'c1', name: 'Atlas Obscura España' }]);
    const html = buildCollectionsMetadataSegment(poi('p1'));
    expect(html).toContain('Atlas Obscura España');
    expect(html).toContain('m19 21-7-4-7 4V5');
    // Sin pill/hashtag/color de colección.
    expect(html).not.toContain('border-radius');
    expect(html).not.toContain('#');
    expect(html).toContain('hsl(var(--foreground))');
  });

  it('marca el nombre como elemento filtrable con datasets canónicos', () => {
    __setCollections('p1', [{ id: 'col-abc', name: 'FullTrips' }]);
    const html = buildCollectionsMetadataSegment(poi('p1'));
    expect(html).toContain('class="collection-filter-chip"');
    expect(html).toContain('data-collection-id="col-abc"');
    expect(html).toContain('data-collection-name="FullTrips"');
  });

  it('inline hasta 2 colecciones separadas por ", "', () => {
    __setCollections('p1', [
      { id: 'c1', name: 'FullTrips' },
      { id: 'c2', name: 'Atlas Obscura España' },
    ]);
    const html = buildCollectionsMetadataSegment(poi('p1'));
    expect(html).toContain('FullTrips');
    expect(html).toContain('Atlas Obscura España');
    expect(html).toContain('FullTrips</span>, <span');
    expect(html).not.toContain('+');
  });

  it('desde la 3ª colección emite "+N" con title listando las restantes', () => {
    __setCollections('p1', [
      { id: 'c1', name: 'FullTrips' },
      { id: 'c2', name: 'Atlas Obscura España' },
      { id: 'c3', name: 'Beaux Villages' },
      { id: 'c4', name: 'Tesoros' },
    ]);
    const html = buildCollectionsMetadataSegment(poi('p1'));
    expect(html).toContain('FullTrips');
    expect(html).toContain('Atlas Obscura España');
    expect(html).toContain('+2');
    expect(html).toContain('title="Beaux Villages, Tesoros"');
    // Las restantes no se renderizan como nombres visibles.
    expect(html).not.toMatch(/data-collection-id="c3"/);
  });
});

describe('P-POPUP-4E — integración línea metadata', () => {
  it('buildOwnAddedLineHtml inserta el segmento tras la fecha', () => {
    __setCollections('p1', [{ id: 'c1', name: 'FullTrips' }]);
    const html = buildOwnAddedLineHtml(poi('p1'));
    expect(html).toContain('Añadido 05/05/2026');
    // Separador · entre fecha y colección.
    const dateIdx = html.indexOf('Añadido 05/05/2026');
    const colIdx = html.indexOf('FullTrips');
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(colIdx).toBeGreaterThan(dateIdx);
    expect(html.slice(dateIdx, colIdx)).toContain('·');
    expect(html).not.toContain('vía');
  });

  it('sin colecciones, la línea sólo muestra "Añadido …" sin separador extra', () => {
    const html = buildOwnAddedLineHtml(poi('p1'));
    expect(html).toContain('Añadido 05/05/2026');
    expect(html).not.toContain('collection-filter-chip');
    expect(html).not.toContain('aria-hidden="true">·');
  });

  it('buildOwnEnrichedMetadataLineHtml — orden fecha · colección · vía', () => {
    __setCollections('p1', [{ id: 'c1', name: 'Atlas Obscura España' }]);
    const html = buildOwnEnrichedMetadataLineHtml(poi('p1', {
      sourceKind: 'external',
      sourceId: 'AtlasObscura',
    }));
    const di = html.indexOf('Añadido');
    const ci = html.indexOf('Atlas Obscura España');
    const vi = html.indexOf('vía');
    expect(di).toBeGreaterThanOrEqual(0);
    expect(ci).toBeGreaterThan(di);
    expect(vi).toBeGreaterThan(ci);
  });
});

describe('P-POPUP-4E — buildCollectionChipsPlaceholder es no-op', () => {
  it('siempre devuelve "" aunque haya colecciones', () => {
    __setCollections('p1', [{ id: 'c1', name: 'FullTrips' }]);
    expect(buildCollectionChipsPlaceholder(poi('p1'))).toBe('');
  });
  it('devuelve "" sin colecciones', () => {
    expect(buildCollectionChipsPlaceholder(poi('p0'))).toBe('');
  });
});
