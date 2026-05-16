/**
 * P-POPUP-4B — collection dedup
 *
 * Garantiza que `filterPersonalTags` suprime las etiquetas personales cuyo
 * slug canónico (`tagSlug`) coincide con el nombre de alguna colección a la
 * que el POI pertenece, sin tocar las que no colisionan.
 *
 * Casos cubiertos (todos extraídos de la auditoría de producción):
 *   - #fulltrips ↔ FullTrips (1.343 POIs)
 *   - #atlas obscura_france ↔ Atlas Obscura_France (18)
 *   - #les plus beaux villages de france ↔ Les Plus Beaux Villages de France (6)
 *   - #atlas obscura_españa ↔ Atlas Obscura_España (4)
 *   - #atlasobscura_italy ↔ Atlas Obscura_Italy (1)
 * Más casos sintéticos que validan separadores extra ('/', '&', '.', '-').
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __map = new Map<string, Array<{ id: string; name: string; color: null; icon: null }>>();
function __setCollections(locId: string, names: string[]) {
  __map.set(
    locId,
    names.map((name, i) => ({ id: `c${i}`, name, color: null, icon: null })),
  );
}
function __reset() { __map.clear(); }

vi.mock('@/domains/content/store/location-collections-store', () => ({
  getCollectionsForLocation: (id: string) => __map.get(id) ?? [],
}));

import { filterPersonalTags } from '@/domains/content/lib/personal-tags-filter';

beforeEach(() => __reset());

describe('P-POPUP-4B — filterPersonalTags vs collections', () => {
  it('suprime #fulltrips cuando el POI pertenece a la colección FullTrips', () => {
    __setCollections('loc-1', ['FullTrips']);
    expect(filterPersonalTags('loc-1', ['#fulltrips'])).toEqual([]);
  });

  it('suprime #atlas obscura_france ↔ Atlas Obscura_France', () => {
    __setCollections('loc-2', ['Atlas Obscura_France']);
    expect(filterPersonalTags('loc-2', ['#atlas obscura_france'])).toEqual([]);
  });

  it('suprime #les plus beaux villages de france ↔ colección homónima', () => {
    __setCollections('loc-3', ['Les Plus Beaux Villages de France']);
    expect(
      filterPersonalTags('loc-3', ['#les plus beaux villages de france']),
    ).toEqual([]);
  });

  it('suprime #atlas obscura_españa ↔ Atlas Obscura_España (caso QA visible)', () => {
    __setCollections('loc-4', ['Atlas Obscura_España']);
    expect(filterPersonalTags('loc-4', ['#atlas obscura_españa'])).toEqual([]);
  });

  it('suprime #atlasobscura_italy ↔ Atlas Obscura_Italy (sin espacio)', () => {
    __setCollections('loc-5', ['Atlas Obscura_Italy']);
    expect(filterPersonalTags('loc-5', ['#atlasobscura_italy'])).toEqual([]);
  });

  it('conserva tags personales que no coinciden con ninguna colección', () => {
    __setCollections('loc-6', ['FullTrips']);
    expect(
      filterPersonalTags('loc-6', ['#favorito', '#paratrip2027']),
    ).toEqual(['#favorito', '#paratrip2027']);
  });

  it('mezcla: suprime el duplicado y conserva el resto preservando orden', () => {
    __setCollections('loc-7', ['FullTrips']);
    expect(
      filterPersonalTags('loc-7', ['#favorito', '#FullTrips', '#otro']),
    ).toEqual(['#favorito', '#otro']);
  });

  it('cubre separadores extra (/, &, ., -, paréntesis)', () => {
    __setCollections('loc-8', ['Villa/Pueblo', 'Naturaleza & Paisaje']);
    expect(
      filterPersonalTags('loc-8', [
        '#villa pueblo',
        '#naturaleza-paisaje',
        '#naturaleza.paisaje',
      ]),
    ).toEqual([]);
  });

  it('deduplica entradas repetidas dentro del propio array de tags', () => {
    __setCollections('loc-9', []);
    expect(
      filterPersonalTags('loc-9', ['#favorito', '#Favorito', 'favorito']),
    ).toEqual(['#favorito']);
  });

  it('devuelve [] cuando no hay tags', () => {
    __setCollections('loc-10', ['FullTrips']);
    expect(filterPersonalTags('loc-10', [])).toEqual([]);
    expect(filterPersonalTags('loc-10', null as any)).toEqual([]);
    expect(filterPersonalTags('loc-10', undefined as any)).toEqual([]);
  });

  it('ignora entradas no-string / vacías', () => {
    __setCollections('loc-11', []);
    expect(
      filterPersonalTags('loc-11', ['#ok', '', '   ', 42 as any, null as any]),
    ).toEqual(['#ok']);
  });

  it('no suprime cuando el POI NO está en la colección homónima', () => {
    __setCollections('loc-12', []); // sin colecciones
    expect(filterPersonalTags('loc-12', ['#fulltrips'])).toEqual(['#fulltrips']);
  });
});
