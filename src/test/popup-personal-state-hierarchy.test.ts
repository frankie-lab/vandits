/**
 * P-POPUP-7A — Personal interaction state hierarchy.
 *
 * Garantiza:
 *  - El helper único `buildPersonalStateBlock` genera UN bloque con:
 *      visited toggle + (verified badge inline si procede) + rating affordance.
 *  - NO renderiza 5 estrellas vacías por defecto cuando user_rating=0
 *    (regresión del problema 2 del plan): aparece affordance textual `Valorar`.
 *  - Con `user_rating > 0`, renderiza el control 5★ expandido + clear button.
 *  - El visited badge usa iconos Lucide (camera / mapPin) — sin emojis 📷/📍.
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

import { buildPersonalStateBlock } from '@/components/map/map-popups';

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

  it('renders Lucide camera SVG (not 📷) when verification is photo', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', oldest_geotagged_photo_date: oldDate }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: false },
    );
    expect(out).not.toContain('\uD83D\uDCF7'); // 📷
    expect(out).not.toContain('\uD83D\uDCCD'); // 📍
    // Debe contener un SVG (camera path o mapPin path).
    expect(out).toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
  });

  it('renders Lucide mapPin SVG when verification is location (within 500m)', () => {
    const out = buildPersonalStateBlock(
      poi('a', { visited: 'true', visited_verified_at: new Date().toISOString() }),
      { isOwn: true, isCuratorPoint: false, canEditLocation: false },
    );
    expect(out).not.toContain('\uD83D\uDCF7');
    expect(out).not.toContain('\uD83D\uDCCD');
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
  });

  it('inserts personalStateOnce() right after descripcion case', () => {
    expect(src).toContain('personalStateOnce()');
    // Y descripcion case incluye el call.
    expect(src).toMatch(/case 'descripcion':[\s\S]{0,400}personalStateOnce\(\)/);
  });
});

describe('P-POPUP-7A — emoji removal across map-popups.ts', () => {
  it('no longer uses 📷 or 📍 anywhere in the file', () => {
    expect(src).not.toContain('\uD83D\uDCF7'); // 📷
    expect(src).not.toContain('\uD83D\uDCCD'); // 📍
  });
});
