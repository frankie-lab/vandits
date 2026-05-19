import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAdoptUpdatePayload } from '@/domains/content/lib/adopt-candidate-payload';

const FIXED = new Date('2026-05-19T10:00:00.000Z');

describe('buildAdoptUpdatePayload — Fase A policy', () => {
  it('candidato google con placeId → persiste external_refs.maps.google', () => {
    const r = buildAdoptUpdatePayload({
      prevExternalRefs: null,
      candidate: {
        name: 'Elevador del Monte de San Pedro',
        lat: 43.37792,
        lng: -8.431581,
        placeId: 'ChIJabc',
        provider: 'google',
      },
      now: FIXED,
    });
    expect(r.wroteGooglePlaceId).toBe(true);
    expect(r.update.external_refs).toEqual({
      maps: {
        google: {
          placeId: 'ChIJabc',
          source: 'places-api-new-text-search',
          resolvedAt: FIXED.toISOString(),
        },
      },
    });
  });

  it('candidato sin provider=google NO escribe external_refs (wikipedia)', () => {
    const r = buildAdoptUpdatePayload({
      candidate: { name: 'X', lat: 1, lng: 2, placeId: 'irrelevant' },
      now: FIXED,
    });
    expect(r.wroteGooglePlaceId).toBe(false);
    expect(r.update.external_refs).toBeUndefined();
  });

  it('candidato google sin placeId NO escribe external_refs', () => {
    const r = buildAdoptUpdatePayload({
      candidate: { name: 'X', lat: 1, lng: 2, provider: 'google' },
      now: FIXED,
    });
    expect(r.wroteGooglePlaceId).toBe(false);
    expect(r.update.external_refs).toBeUndefined();
  });

  it('merge no destructivo: conserva external_refs previos', () => {
    const r = buildAdoptUpdatePayload({
      prevExternalRefs: {
        maps: { apple: { url: 'https://maps.apple.com/?q=foo' } },
        other: { keep: true },
      },
      candidate: {
        name: 'X',
        lat: 1,
        lng: 2,
        placeId: 'ChIJxyz',
        provider: 'google',
      },
      now: FIXED,
    });
    expect(r.update.external_refs).toEqual({
      other: { keep: true },
      maps: {
        apple: { url: 'https://maps.apple.com/?q=foo' },
        google: {
          placeId: 'ChIJxyz',
          source: 'places-api-new-text-search',
          resolvedAt: FIXED.toISOString(),
        },
      },
    });
  });

  it('siempre escribe name + lat + lng + updated_at', () => {
    const r = buildAdoptUpdatePayload({
      candidate: { name: '  Foo  ', lat: 10, lng: 20 },
      now: FIXED,
    });
    expect(r.update.name).toBe('Foo');
    expect(r.update.latitude).toBe(10);
    expect(r.update.longitude).toBe(20);
    expect(r.update.updated_at).toBe(FIXED.toISOString());
  });
});

// ---------------------------------------------------------------------------
// wiki-name-search mapper preserves placeId/provider only from google source
// ---------------------------------------------------------------------------

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { searchWikiCandidates } from '@/domains/content/lib/wiki-name-search';
import { supabase } from '@/integrations/supabase/client';

describe('searchWikiCandidates — preserva placeId/provider del candidato Google', () => {
  beforeEach(() => {
    (supabase.functions.invoke as any).mockReset();
  });

  it('conserva placeId + provider cuando vienen de google-places', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        candidates: [
          {
            name: 'Elevador del Monte de San Pedro',
            lat: 43.37792,
            lng: -8.431581,
            placeId: 'ChIJabc',
            provider: 'google',
          },
        ],
      },
      error: null,
    });
    const out = await searchWikiCandidates('Elevador', { lat: 43.3, lng: -8.4 });
    expect(out[0].placeId).toBe('ChIJabc');
    expect(out[0].provider).toBe('google');
  });

  it('descarta provider no-google y placeId vacío', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: {
        candidates: [
          { name: 'A', lat: 1, lng: 2, placeId: '', provider: 'wikidata' },
          { name: 'B', lat: 3, lng: 4 },
        ],
      },
      error: null,
    });
    const out = await searchWikiCandidates('x');
    expect(out[0].placeId).toBeUndefined();
    expect(out[0].provider).toBeUndefined();
    expect(out[1].placeId).toBeUndefined();
    expect(out[1].provider).toBeUndefined();
  });
});
