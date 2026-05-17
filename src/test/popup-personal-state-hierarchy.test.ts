/**
 * P-POPUP-7A — Personal interaction state hierarchy.
 *
 * Garantiza:
 *  - El helper único `buildPersonalStateBlock` genera UN bloque con:
 *      visited toggle + (verified badge inline si procede) + rating affordance.
 *  - NO renderiza 5 estrellas vacías por defecto cuando user_rating=0
 *    (regresión del problema 2 del plan): aparece affordance textual `Valorar`.
 *  - Con `user_rating > 0`, renderiza el control 5★ expandido + clear button.
 *  - El visited badge usa iconos Lucide (camera / mapPin) — sin emojis (camera/pin).
 *  - Devuelve '' para `isCuratorPoint` y para popups `nearby`.
 *  - El bloque enriched ya NO contiene `data-action="toggle-visited"` antes
 *    del bloque `Descripción` (queda debajo via `buildPersonalStateBlock`).
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

describe('P-POPUP-7A — buildPersonalStateBlock', () => {
  it('returns empty for curator points', () => {
    const out = buildPersonalStateBlock(poi('a'), { isOwn: true, isCuratorPoint: true, canEditLocation: true });
    expect(out).toBe('');
  });

  it('returns empty for nearby popup context', () => {
    const out = buildPersonalStateBlock(poi('nearby-id'), { isOwn: true, isCuratorPoint: false, canEditLocation: true });
    expect(out).toBe('');
  });

  it('always renders the visited toggle with data-action="toggle-visited"', () => {
    const out = buildPersonalStateBlock(poi('a'), { isOwn: true, isCuratorPoint: false, canEditLocation: false });
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).toContain('data-location-id="a"');
  });

  it('does NOT render 5 empty stars when user_rating is unset (collapsed affordance)', () => {
    const out = buildPersonalStateBlock(
      poi('a'),
      { isOwn: true, isCuratorPoint: false, canEditLocation: true },
    );
    // Affordance textual "Valorar" presente.
    expect(out).toContain('>Valorar<');
    expect(out).toContain('data-personal-rating-state="collapsed"');
    // El control 5★ existe en DOM pero está oculto (display:none) hasta interactuar.
    expect(out).toContain("display: none");
    // No deben aparecer 5 estrellas activas (★ amarillas) por defecto.
    const activeStarMatches = out.match(/\u2605/g) ?? [];
    expect(activeStarMatches.length).toBe(0);
  });

  it('renders 5★ expanded with clear button when user_rating > 0', () => {
    const out = buildPersonalStateBlock(
      poi('a', { user_rating: '3' }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: false },
    );
    expect(out).toContain('data-personal-rating-state="expanded"');
    expect(out).toContain('data-action="set-rating"');
    expect(out).toContain('data-action="clear-rating"');
    // 3 estrellas llenas + 2 vacías = 3 ★ y 2 ☆.
    const filled = (out.match(/\u2605/g) ?? []).length;
    const empty = (out.match(/\u2606/g) ?? []).length;
    expect(filled).toBe(3);
    expect(empty).toBe(2);
    // No debe quedar el affordance "Valorar" cuando ya hay rating.
    expect(out).not.toContain('>Valorar<');
  });

  it('hides rating completely when user_rating=0 AND cannot rate', () => {
    const out = buildPersonalStateBlock(
      poi('a'),
      { isOwn: false, isCuratorPoint: false, canEditLocation: false },
    );
    // Sólo visited toggle, sin affordance Valorar.
    expect(out).toContain('data-action="toggle-visited"');
    expect(out).not.toContain('>Valorar<');
    expect(out).not.toContain('data-action="set-rating"');
  });

  it('renders Lucide camera SVG (not emoji) when verification is photo', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', oldest_geotagged_photo_date: oldDate }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: false },
    );
    expect(out).not.toContain('\uD83D\uDCF7'); // camera emoji
    expect(out).not.toContain('\uD83D\uDCCD'); // pin emoji
    // Debe contener un SVG (camera path o mapPin path).
    expect(out).toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
  });

  it('renders Lucide mapPin SVG when verification is location (within 500m)', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: false },
    );
    expect(out).not.toContain('\uD83D\uDCF7'); // camera emoji
    expect(out).not.toContain('\uD83D\uDCCD'); // pin emoji
    expect(out).toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
  });
});

describe('P-POPUP-7A — enriched branch upper section no longer has visited toggle', () => {
  // Static scan: la rama enriched (`if (isEnriched && enriched) {`) ya NO debe
  // contener `data-action="toggle-visited"` arriba — sólo aparece dentro del
  // helper `buildPersonalStateBlock`, que se monta debajo de `descripcion`.
  it('removes inline visited toggle from the upper interaction section', () => {
    const lines = src.split('\n');
    const startIdx = lines.findIndex((l) => l.includes('if (isEnriched && enriched) {'));
    expect(startIdx).toBeGreaterThan(0);
    const descIdx = lines.findIndex(
      (l, i) => i > startIdx && l.includes("case 'descripcion'"),
    );
    expect(descIdx).toBeGreaterThan(startIdx);
    const upper = lines.slice(startIdx, descIdx).join('\n');
    expect(upper).not.toContain('data-action="toggle-visited"');
    expect(upper).not.toContain('data-action="set-rating"');
    // P-POPUP-7A.3 — G1: enrichmentRating NO vive en cabecera.
    expect(upper).not.toContain('weighted-rating-container');
    expect(upper).not.toContain('data-ai-rating');
    expect(upper).not.toMatch(/enriched\.indice_interes\s*\?/);
  });

  it('P-POPUP-7A.3 — composer declares disjoint slots (enrichmentRating + personalState)', () => {
    expect(src).toMatch(/case 'descripcion':[\s\S]{0,800}return desc;\s*\}/);
    expect(src).toContain("CANONICAL_KEYS = new Set(['descripcion', 'observacion'])");
    // Slots disjuntos: enrichmentRating y userPersonalState declarados por separado.
    expect(src).toContain('buildEnrichmentRatingBlock(location, enriched, { isCuratorPoint })');
    expect(src).toContain('const enrichmentRatingFragment = buildEnrichmentRatingBlock');
    expect(src).toContain('const personalStateFragment = buildPersonalStateBlock');
    // No queda el nombre ambiguo legacy `ratingFragment` en el composer.
    expect(src).not.toMatch(/\bratingFragment\b/);
    // Tripleta canónica extendida con orden congelado 1→2→3→4.
    expect(src).toContain('[descFragment, enrichmentRatingFragment, personalStateFragment, obsFragment]');
    // Fallback: cuando no hay claves canónicas configuradas, ambos slots
    // semánticos se anclan al final, en orden.
    expect(src).toMatch(/firstCanonicalIdx === -1[\s\S]{0,300}composed\.push\(enrichmentRatingFragment, personalStateFragment\)/);
  });

  it('P-POPUP-7A.3 — G2: indice_interes stars exist only inside buildEnrichmentRatingBlock', () => {
    const lines = src.split('\n');
    const startIdx = lines.findIndex((l) => l.includes('export function buildEnrichmentRatingBlock'));
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = lines.findIndex((l, i) => i > startIdx && /^export function /.test(l));
    expect(endIdx).toBeGreaterThan(startIdx);
    const stripComments = (slice: string[]) =>
      slice.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const before = stripComments(lines.slice(0, startIdx));
    const after = stripComments(lines.slice(endIdx));
    expect(before).not.toContain('weighted-rating-container');
    expect(after).not.toContain('weighted-rating-container');
    expect(after).not.toMatch(/\$\{[^}]*indice_interes[^}]*\}[^]{0,80}[\u2605\u2606]/);
  });

  it('P-POPUP-7A.3 — G8: helpers no comparten datos del concepto contrario', () => {
    const lines = src.split('\n');
    // Filtra líneas de comentario para no contaminar con bloques doc del
    // siguiente helper (que mencionan ambos conceptos a propósito).
    const stripComments = (slice: string[]) =>
      slice.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    // buildEnrichmentRatingBlock no toca user state.
    const eStart = lines.findIndex((l) => l.includes('export function buildEnrichmentRatingBlock'));
    const eEnd = lines.findIndex((l, i) => i > eStart && /^export function /.test(l));
    const enrichBody = stripComments(lines.slice(eStart, eEnd));
    expect(enrichBody).not.toContain('data-action="set-rating"');
    expect(enrichBody).not.toContain('data-action="clear-rating"');
    expect(enrichBody).not.toContain('user_rating');
    expect(enrichBody).not.toContain('data-personal-rating-state');
    // buildPersonalStateBlock no toca enrichment rating.
    const pStart = lines.findIndex((l) => l.includes('export function buildPersonalStateBlock'));
    const pEnd = lines.findIndex((l, i) => i > pStart && /^export function /.test(l));
    const personalBody = stripComments(lines.slice(pStart, pEnd));
    expect(personalBody).not.toContain('weighted-rating-container');
    expect(personalBody).not.toContain('data-ai-rating');
    expect(personalBody).not.toContain('indice_interes');
  });
});

describe('P-POPUP-7A.3 — buildEnrichmentRatingBlock', () => {

  it('returns weighted-rating-container for curator points (even with no rating)', () => {
    const out = buildEnrichmentRatingBlock(poi('a'), { indice_interes: 0 }, { isCuratorPoint: true });
    expect(out).toContain('class="weighted-rating-container"');
    expect(out).toContain('data-ai-rating="0"');
  });

  it('returns amber chip with 5 stars when non-curator has indice_interes', () => {
    const out = buildEnrichmentRatingBlock(poi('a'), { indice_interes: 3 }, { isCuratorPoint: false });
    expect(out).toContain('data-popup-enrichment-rating="a"');
    const filled = (out.match(/\u2605/g) ?? []).length;
    const empty = (out.match(/\u2606/g) ?? []).length;
    expect(filled).toBe(3);
    expect(empty).toBe(2);
  });

  it('returns "" for non-curator without indice_interes', () => {
    expect(buildEnrichmentRatingBlock(poi('a'), null, { isCuratorPoint: false })).toBe('');
    expect(buildEnrichmentRatingBlock(poi('a'), { indice_interes: 0 }, { isCuratorPoint: false })).toBe('');
  });

  it('G9 — no stars rendered above description in composer output (structural)', () => {
    // Validación estructural: en `map-popups.ts` no aparece ningún ★/☆ entre
    // `if (isEnriched && enriched) {` y `case 'descripcion'` (la cabecera).
    const lines = src.split('\n');
    const startIdx = lines.findIndex((l) => l.includes('if (isEnriched && enriched) {'));
    const descIdx = lines.findIndex(
      (l, i) => i > startIdx && l.includes("case 'descripcion'"),
    );
    const upper = lines.slice(startIdx, descIdx).join('\n');
    expect(upper).not.toMatch(/[\u2605\u2606]/);
  });
});

describe('P-POPUP-7A — emoji removal across map-popups.ts', () => {
  it('no longer uses camera or pin emojis anywhere in the file', () => {
    expect(src).not.toContain('\uD83D\uDCF7'); // camera emoji
    expect(src).not.toContain('\uD83D\uDCCD'); // pin emoji
  });
});
