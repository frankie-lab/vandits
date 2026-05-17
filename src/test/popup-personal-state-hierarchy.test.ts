/**
 * P-POPUP-7A / P-POPUP-14 — Personal interaction state + Unified ratings.
 *
 * Bajo P-POPUP-14 el helper `buildPersonalStateBlock` conserva SOLO el
 * toggle de visitado (visited button + verified badge). El rating personal
 * del usuario (5★ / "Valorar") migra al bloque unificado producido por
 * `buildEnrichmentRatingBlock` como segunda fila ("Tu valoración"), bajo
 * la primera fila ("Rating del POI" ← `enriched.indice_interes`).
 *
 * Esta migración deroga G8 del contrato P-POPUP-7A.2: ambos conceptos
 * (rating semántico del POI y valoración personal) coexisten DENTRO del
 * mismo bloque unificado de ratings por canon visual editorial.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { GeoLocation } from '@/types/location';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: (id: string) => id === 'nearby-id',
}));

vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import { buildPersonalStateBlock, buildEnrichmentRatingBlock } from '@/components/map/map-popups';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');
const src = readFileSync(SRC, 'utf8');

function poi(id: string, customData: Record<string, string> = {}): GeoLocation {
  return {
    id,
    name: id,
    coordinates: { lat: 0, lng: 0 },
    customData,
  } as unknown as GeoLocation;
}

describe('P-POPUP-7A — buildPersonalStateBlock (post P-POPUP-14)', () => {
  it('returns empty for curator points', () => {
    const out = buildPersonalStateBlock(poi('a'), { isOwn: true, isCuratorPoint: true, canEditLocation: true });
    expect(out).toBe('');
  });

  it('returns empty for nearby popup context', () => {
    const out = buildPersonalStateBlock(poi('nearby-id'), { isOwn: true, isCuratorPoint: false, canEditLocation: true });
    expect(out).toBe('');
  });

  it('renders ONLY the visited toggle (no rating affordance)', () => {
    const out = buildPersonalStateBlock(poi('a'), { isOwn: true, isCuratorPoint: false, canEditLocation: true });
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('data-location-id="a"');
    // P-POPUP-14: el rating ya NO vive aquí.
    expect(out).not.toContain('data-action="set-rating"');
    expect(out).not.toContain('data-action="clear-rating"');
    expect(out).not.toContain('data-personal-rating-state');
    expect(out).not.toContain('>Valorar<');
  });
});

describe('P-POPUP-14 — buildEnrichmentRatingBlock (unified ratings block)', () => {
  it('marker `data-popup-ratings-block="v1"` presente en el bloque', () => {
    const out = buildEnrichmentRatingBlock(poi('a'), { indice_interes: 4 }, { isCuratorPoint: false });
    expect(out).toContain('data-popup-ratings-block="v1"');
    expect(out).toContain('data-popup-enrichment-rating="a"');
  });

  it('Row 1 — "Rating del POI" con estrellas cuando hay indice_interes', () => {
    const out = buildEnrichmentRatingBlock(poi('a'), { indice_interes: 3 }, { isCuratorPoint: false });
    expect(out).toContain('Rating del POI');
    const filled = (out.match(/\u2605/g) ?? []).length;
    const empty = (out.match(/\u2606/g) ?? []).length;
    expect(filled).toBe(3);
    expect(empty).toBe(2);
  });

  it('returns "" para non-curator sin indice_interes y sin visited', () => {
    expect(buildEnrichmentRatingBlock(poi('a'), null, { isCuratorPoint: false })).toBe('');
    expect(buildEnrichmentRatingBlock(poi('a'), { indice_interes: 0 }, { isCuratorPoint: false })).toBe('');
  });

  it('Row 2 NO aparece si el POI no está visitado', () => {
    const out = buildEnrichmentRatingBlock(
      poi('a'),
      { indice_interes: 4 },
      { isCuratorPoint: false, isOwn: true, canEditLocation: true },
    );
    expect(out).not.toContain('Tu valoración');
    expect(out).not.toContain('data-action="set-rating"');
    expect(out).not.toContain('>Valorar<');
  });

  it('Row 2 aparece como affordance "Valorar" inline si visited && sin user_rating', () => {
    const out = buildEnrichmentRatingBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }),
      { indice_interes: 4 },
      { isCuratorPoint: false, isOwn: true, canEditLocation: true },
    );
    expect(out).toContain('Tu valoración');
    expect(out).toContain('>Valorar<');
    expect(out).toContain('data-personal-rating-state="collapsed"');
    expect(out).toContain('data-personal-rating-state="expanded"');
  });

  it('Row 2 muestra 5★ expandido + clear cuando visited && user_rating>0', () => {
    const out = buildEnrichmentRatingBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString(), user_rating: '3' }),
      { indice_interes: 4 },
      { isCuratorPoint: false, isOwn: true, canEditLocation: true },
    );
    expect(out).toContain('Tu valoración');
    expect(out).toContain('data-action="set-rating"');
    expect(out).toContain('data-action="clear-rating"');
    expect(out).not.toContain('>Valorar<');
  });

  it('Row 2 ausente si el POI es curator (incluso visitado)', () => {
    const out = buildEnrichmentRatingBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString(), user_rating: '4' }),
      { indice_interes: 4 },
      { isCuratorPoint: true },
    );
    expect(out).not.toContain('Tu valoración');
    expect(out).not.toContain('data-action="set-rating"');
  });

  it('Row 2 ausente en contexto nearby popup', () => {
    const out = buildEnrichmentRatingBlock(
      poi('nearby-id', { visited: 'true', user_rating: '4' }),
      { indice_interes: 4 },
      { isCuratorPoint: false, isOwn: true, canEditLocation: true },
    );
    expect(out).not.toContain('Tu valoración');
  });

  it('Curator point conserva weighted-rating-container + data-ai-rating', () => {
    const out = buildEnrichmentRatingBlock(poi('a'), { indice_interes: 0 }, { isCuratorPoint: true });
    expect(out).toContain('class="weighted-rating-container"');
    expect(out).toContain('data-ai-rating="0"');
    expect(out).toContain('Rating del POI');
  });

  it('Layout label↔stars: ambas filas usan justify-content: space-between', () => {
    const out = buildEnrichmentRatingBlock(
      poi('a', { visited: 'true', user_rating: '3' }),
      { indice_interes: 4 },
      { isCuratorPoint: false, isOwn: true, canEditLocation: true },
    );
    const occurrences = (out.match(/justify-content: space-between/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('P-POPUP-14 — composer wiring + structural guards', () => {
  it('composer pasa isOwn + canEditLocation a buildEnrichmentRatingBlock', () => {
    expect(src).toContain('{ isCuratorPoint, isOwn, canEditLocation }');
  });

  it('buildPersonalStateBlock ya NO contiene data-action="set-rating"/"clear-rating"', () => {
    const lines = src.split('\n');
    const pStart = lines.findIndex((l) => l.includes('export function buildPersonalStateBlock'));
    const pEnd = lines.findIndex((l, i) => i > pStart && /^export function /.test(l));
    const body = lines.slice(pStart, pEnd).join('\n');
    expect(body).not.toContain('data-action="set-rating"');
    expect(body).not.toContain('data-action="clear-rating"');
  });

  it('ratings unificados: estrellas de user_rating viven dentro de buildEnrichmentRatingBlock', () => {
    const lines = src.split('\n');
    const eStart = lines.findIndex((l) => l.includes('export function buildEnrichmentRatingBlock'));
    const eEnd = lines.findIndex((l, i) => i > eStart && /^export function /.test(l));
    const body = lines.slice(eStart, eEnd).join('\n');
    expect(body).toContain('data-action="set-rating"');
    expect(body).toContain('user_rating');
    expect(body).toContain('Tu valoración');
    expect(body).toContain('Rating del POI');
  });
});
