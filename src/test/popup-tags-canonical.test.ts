/**
 * P-POPUP-2 — Contract tests for canonical popup tag bucketing + dedupe.
 * Pure-function tests.
 */
import { describe, it, expect } from 'vitest';
import {
  dedupePopupTagBuckets,
  extractTaxonomyCandidates,
  getCanonicalPopupTags,
  tagSlug,
  POPUP_TAG_CAPS,
} from '@/shared/popup/tags';
import type { GeoLocation } from '@/types/location';

function makeLoc(enriched: any): GeoLocation {
  return {
    id: 't', name: 't', coordinates: { lat: 0, lng: 0 }, enrichedData: enriched,
  } as unknown as GeoLocation;
}

describe('P-POPUP-2 — tagSlug', () => {
  it('normalises hash, case, accents, separators', () => {
    expect(tagSlug('#Castillo')).toBe('castillo');
    expect(tagSlug('Atlas Obscura')).toBe('atlasobscura');
    expect(tagSlug('Camí_de-Sant Jaume')).toBe('camidesantjaume');
    expect(tagSlug('  ')).toBe('');
  });

  it('P2-FIX-C — collapses all non-alphanumeric separators (slash, &, parens, dot, comma)', () => {
    expect(tagSlug('Villa/Pueblo')).toBe(tagSlug('Villa Pueblo'));
    expect(tagSlug('Naturaleza & Paisaje')).toBe(tagSlug('Naturaleza Paisaje'));
    expect(tagSlug('Iglesia (s. XII)')).toBe(tagSlug('iglesia s xii'));
    expect(tagSlug('Bar,Restaurante')).toBe(tagSlug('Bar Restaurante'));
    expect(tagSlug('1.2 Villa/Pueblo')).toBe('12villapueblo');
  });
});

describe('P-POPUP-2 — extractTaxonomyCandidates', () => {
  it('strips IA numbering prefixes', () => {
    const out = extractTaxonomyCandidates({
      clasificacion: {
        categoria_principal: '1. Arquitectura',
        subcategoria: '1.2 Castillos',
        tipo_especifico: '1.2.3 Castillo medieval',
      },
    });
    expect(out).toEqual(['Arquitectura', 'Castillos', 'Castillo medieval']);
  });

  it('returns empty when no clasificacion', () => {
    expect(extractTaxonomyCandidates({})).toEqual([]);
    expect(extractTaxonomyCandidates(null)).toEqual([]);
  });

  it('P2-FIX-E — splits payloads where IA concatenated levels with ">"', () => {
    const out = extractTaxonomyCandidates({
      clasificacion: {
        categoria_principal: '1.2 Asentamientos humanos > Villa/Pueblo',
        subcategoria: '1.2 Villa/Pueblo',
        tipo_especifico: 'Villa/Pueblo',
      },
    });
    // Splits the `>`, strips numbering, dedupes by slug (Villa/Pueblo ↔
    // Villa/Pueblo collapses; thanks to P2-FIX-C the slash separator also
    // matches "Villa Pueblo" if it appeared).
    expect(out).toEqual(['Asentamientos humanos', 'Villa/Pueblo']);
  });

  it('P2-FIX-E — taxonomy chip is not duplicated as a semantic hashtag', () => {
    // Simulates the preview regression: taxonomy emits "Villa/Pueblo" and
    // enriched.etiquetas re-emits the same concept under different spelling.
    const buckets = dedupePopupTagBuckets({
      taxonomy: extractTaxonomyCandidates({
        clasificacion: { categoria_principal: '1.2 Asentamientos humanos > Villa/Pueblo' },
      }),
      collectionSlugs: [],
      semantic: ['Asentamientoshumanos', 'Villa Pueblo', 'medieval'],
      user: [],
    });
    expect(buckets.taxonomy).toEqual(['Asentamientos humanos', 'Villa/Pueblo']);
    expect(buckets.semantic).toEqual(['medieval']);
  });
});

describe('P-POPUP-2 — dedupePopupTagBuckets', () => {
  it('produces 4 disjoint buckets by slug', () => {
    const r = dedupePopupTagBuckets({
      taxonomy: ['Castillo'],
      collectionSlugs: ['atlasobscura'],
      semantic: ['castillo', 'medieval', 'atlas obscura'],
      user: ['#favorito', 'medieval', 'Castillo'],
    });
    expect(r.taxonomy).toEqual(['Castillo']);
    expect(r.semantic).toEqual(['medieval']); // castillo↔taxonomy, atlas obscura↔collection
    expect(r.user).toEqual(['#favorito']);
  });

  it('removes geographic tags from semantic (they live in geo header)', () => {
    const r = dedupePopupTagBuckets({
      taxonomy: [],
      collectionSlugs: [],
      semantic: ['España', 'medieval', 'Aragón'],
      user: [],
      geographic: ['España', 'Aragón'],
    });
    expect(r.semantic).toEqual(['medieval']);
  });

  it('priority: taxonomy > collection > semantic > user', () => {
    const r = dedupePopupTagBuckets({
      taxonomy: ['Castillo'],
      collectionSlugs: ['castillo'], // collision with taxonomy
      semantic: ['Castillo'],
      user: ['Castillo'],
    });
    expect(r.taxonomy).toEqual(['Castillo']);
    expect(r.semantic).toEqual([]);
    expect(r.user).toEqual([]);
  });

  it('handles empty / undefined inputs safely', () => {
    const r = dedupePopupTagBuckets({
      taxonomy: [], collectionSlugs: [], semantic: [], user: [],
    });
    expect(r.taxonomy).toEqual([]);
    expect(r.semantic).toEqual([]);
    expect(r.user).toEqual([]);
  });

  it('skips non-string and empty entries', () => {
    const r = dedupePopupTagBuckets({
      taxonomy: [null as any, '', 'Castillo', undefined as any],
      collectionSlugs: [],
      semantic: ['  ', 42 as any, 'medieval'],
      user: [],
    });
    expect(r.taxonomy).toEqual(['Castillo']);
    expect(r.semantic).toEqual(['medieval']);
  });
});

describe('P-POPUP-2 — getCanonicalPopupTags', () => {
  it('integrates taxonomy + semantic + user from a GeoLocation', () => {
    const loc = makeLoc({
      clasificacion: {
        categoria_principal: '1. Arquitectura',
        subcategoria: '1.2 Castillos',
      },
      etiquetas: ['medieval', 'castillos', 'piedra'],
      etiquetas_geograficas: ['España'],
      etiquetas_personales: ['favorito'],
    });
    const r = getCanonicalPopupTags(loc, ['atlasobscura'], ['favorito']);
    expect(r.taxonomy).toEqual(['Arquitectura', 'Castillos']);
    // 'castillos' deduped against taxonomy 'Castillos' (slug match)
    expect(r.semantic).toEqual(['medieval', 'piedra']);
    expect(r.user).toEqual(['favorito']);
  });
});

describe('P-POPUP-2 — POPUP_TAG_CAPS', () => {
  it('matches plan §5.4 visible limits', () => {
    expect(POPUP_TAG_CAPS).toEqual({
      taxonomy: 3,
      collections: 4,
      semantic: 5,
      user: 4,
    });
  });
});
