/**
 * Health Rings v2 — covers the 4-bucket operative outline:
 *   partial · chain · review · hardError
 *
 * Targets:
 *  - getPointHealthRings (point-health-rings)
 *  - getEnrichmentFailureBucket / getCoherenceMismatchKind / bucketForKind
 *    (enrichment-failure-state)
 *  - getCoherenceGlyph (point-health-rings)
 *
 * The enrichment failure cache is populated synchronously via
 * `enrichmentFailureStore.recordFailure()` so we don't need the DB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GeoLocation } from '@/types/location';
import {
  getPointHealthRings,
  getCoherenceGlyph,
} from '@/domains/content/lib/point-health-rings';
import {
  bucketForKind,
  getEnrichmentFailureBucket,
  getCoherenceMismatchKind,
} from '@/domains/content/lib/enrichment-failure-state';
import { enrichmentFailureStore } from '@/domains/content/hooks/use-enrichment-failure';
import type {
  EnrichmentErrorKind,
  ParsedEnrichmentError,
} from '@/domains/content/lib/enrichment-error-kind';

const baseLoc = (overrides: Partial<GeoLocation> = {}): GeoLocation => ({
  id: `loc-${Math.random().toString(36).slice(2)}`,
  name: 'Test',
  coordinates: { lat: 0, lng: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const enrichedLoc = (overrides: Partial<GeoLocation> = {}): GeoLocation =>
  baseLoc({
    enrichedData: { descripcion: 'IA description here' } as any,
    ...overrides,
  });

const recordKind = (
  id: string,
  kind: EnrichmentErrorKind,
  extra: Partial<ParsedEnrichmentError> = {},
) => {
  enrichmentFailureStore.recordFailure(id, {
    kind,
    message: `simulated ${kind}`,
    ...extra,
  });
};

beforeEach(() => {
  enrichmentFailureStore.invalidate();
});

describe('getPointHealthRings — buckets aislados', () => {
  it('partial: solo geoHealth=partial', () => {
    const loc = baseLoc({ geoHealth: 'partial' });
    expect(getPointHealthRings(loc)).toEqual(['partial']);
  });

  it('chain: geoHealth=broken', () => {
    const loc = baseLoc({ geoHealth: 'broken' });
    expect(getPointHealthRings(loc)).toEqual(['chain']);
  });

  it('chain: geoHealth=stale_name', () => {
    const loc = baseLoc({ geoHealth: 'stale_name' });
    expect(getPointHealthRings(loc)).toEqual(['chain']);
  });

  it('review: kind=coherence', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'coherence', { mismatchKind: 'coordinate' });
    expect(getPointHealthRings(loc)).toEqual(['review']);
  });

  it('review: kind=llm_unverifiable', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'llm_unverifiable');
    expect(getPointHealthRings(loc)).toEqual(['review']);
  });

  it('review: kind=no_match', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'no_match');
    expect(getPointHealthRings(loc)).toEqual(['review']);
  });

  it('hardError: kind=rate_limit', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'rate_limit');
    expect(getPointHealthRings(loc)).toEqual(['hardError']);
  });

  it('hardError: timeout/network/unknown/no_credits', () => {
    const kinds: EnrichmentErrorKind[] = ['timeout', 'network', 'unknown', 'no_credits'];
    for (const k of kinds) {
      const loc = baseLoc();
      recordKind(loc.id, k);
      expect(getPointHealthRings(loc)).toEqual(['hardError']);
    }
  });
});

describe('getPointHealthRings — combinaciones (orden inner→outer)', () => {
  it('partial + chain', () => {
    const loc = baseLoc({ geoHealth: 'broken' });
    // geoHealth excludes partial; simulate partial via fixture instead:
    const loc2 = baseLoc({ geoHealth: 'partial' });
    expect(getPointHealthRings(loc).includes('chain')).toBe(true);
    expect(getPointHealthRings(loc2).includes('partial')).toBe(true);
  });

  it('chain + review', () => {
    const loc = baseLoc({ geoHealth: 'broken' });
    recordKind(loc.id, 'coherence');
    expect(getPointHealthRings(loc)).toEqual(['chain', 'review']);
  });

  it('partial + chain + hardError (geoHealth wins one slot, but chain takes priority)', () => {
    // geoHealth puede ser solo uno; usamos chain + hardError
    const loc = baseLoc({ geoHealth: 'broken' });
    recordKind(loc.id, 'timeout');
    expect(getPointHealthRings(loc)).toEqual(['chain', 'hardError']);
  });

  it('todos los rings posibles a la vez: partial geo + hardError', () => {
    const loc = baseLoc({ geoHealth: 'partial' });
    recordKind(loc.id, 'network');
    expect(getPointHealthRings(loc)).toEqual(['partial', 'hardError']);
  });
});

describe('regla "verde nunca marca review/hardError"', () => {
  it('enriched + coherence → no review ring', () => {
    const loc = enrichedLoc();
    recordKind(loc.id, 'coherence', { mismatchKind: 'name' });
    expect(getPointHealthRings(loc)).toEqual([]);
  });

  it('enriched + hard error → no hardError ring', () => {
    const loc = enrichedLoc();
    recordKind(loc.id, 'rate_limit');
    expect(getPointHealthRings(loc)).toEqual([]);
  });

  it('enriched PUEDE seguir con partial/chain (geo independiente)', () => {
    const loc = enrichedLoc({ geoHealth: 'broken' });
    expect(getPointHealthRings(loc)).toEqual(['chain']);
  });
});

describe('bucketForKind', () => {
  it('mapea coherence/no_match/llm_unverifiable → review', () => {
    expect(bucketForKind('coherence')).toBe('review');
    expect(bucketForKind('no_match')).toBe('review');
    expect(bucketForKind('llm_unverifiable')).toBe('review');
  });

  it('mapea rate_limit/timeout/network/unknown/no_credits → hardError', () => {
    expect(bucketForKind('rate_limit')).toBe('hardError');
    expect(bucketForKind('timeout')).toBe('hardError');
    expect(bucketForKind('network')).toBe('hardError');
    expect(bucketForKind('unknown')).toBe('hardError');
    expect(bucketForKind('no_credits')).toBe('hardError');
  });

  it('null/undefined → null', () => {
    expect(bucketForKind(null)).toBe(null);
    expect(bucketForKind(undefined)).toBe(null);
  });
});

describe('getEnrichmentFailureBucket', () => {
  it('devuelve review/hardError consistente con bucketForKind', () => {
    const a = baseLoc();
    recordKind(a.id, 'coherence', { mismatchKind: 'coordinate' });
    expect(getEnrichmentFailureBucket(a)).toBe('review');

    const b = baseLoc();
    recordKind(b.id, 'timeout');
    expect(getEnrichmentFailureBucket(b)).toBe('hardError');
  });

  it('devuelve null para enriched (verde nunca marca)', () => {
    const loc = enrichedLoc();
    recordKind(loc.id, 'coherence');
    expect(getEnrichmentFailureBucket(loc)).toBe(null);
  });

  it('devuelve null si no hay fallo registrado', () => {
    expect(getEnrichmentFailureBucket(baseLoc())).toBe(null);
  });
});

describe('getCoherenceMismatchKind / getCoherenceGlyph', () => {
  it('coherence + mismatchKind=coordinate → glyph=coordinate', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'coherence', { mismatchKind: 'coordinate' });
    expect(getCoherenceMismatchKind(loc)).toBe('coordinate');
    expect(getCoherenceGlyph(loc)).toBe('coordinate');
  });

  it('coherence + mismatchKind=name → glyph=name', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'coherence', { mismatchKind: 'name' });
    expect(getCoherenceMismatchKind(loc)).toBe('name');
    expect(getCoherenceGlyph(loc)).toBe('name');
  });

  it('coherence sin mismatchKind → glyph=null (ring magenta sin badge)', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'coherence');
    expect(getCoherenceGlyph(loc)).toBe(null);
  });

  it('llm_unverifiable → glyph=null', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'llm_unverifiable');
    expect(getCoherenceGlyph(loc)).toBe(null);
  });

  it('no_match → glyph=null', () => {
    const loc = baseLoc();
    recordKind(loc.id, 'no_match');
    expect(getCoherenceGlyph(loc)).toBe(null);
  });

  it('hardError kinds → glyph=null', () => {
    const kinds: EnrichmentErrorKind[] = ['rate_limit', 'timeout', 'network', 'unknown', 'no_credits'];
    for (const k of kinds) {
      const loc = baseLoc();
      recordKind(loc.id, k);
      expect(getCoherenceGlyph(loc)).toBe(null);
    }
  });

  it('enriched → glyph=null (verde nunca marca review)', () => {
    const loc = enrichedLoc();
    recordKind(loc.id, 'coherence', { mismatchKind: 'coordinate' });
    expect(getCoherenceGlyph(loc)).toBe(null);
  });
});
