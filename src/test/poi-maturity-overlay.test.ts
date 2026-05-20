/**
 * poi-maturity-overlay.test.ts — Contract tests del overlay diagnóstico
 * POI-Maturity (v1.2.18).
 *
 * Cubre los gates del helper puro `shouldRenderMaturityBadge` y la
 * resolución de estilo `resolveMaturityBadgeStyle`. NO testea el
 * componente Leaflet (capa imperativa); el componente reusa el helper.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldRenderMaturityBadge,
  resolveMaturityBadgeStyle,
} from '@/shared/diagnostics/poi-maturity-overlay';
import type { GeoLocation } from '@/types/location';
import type { MarkerRenderMode } from '@/components/map/map-icons';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function poi(extra: Record<string, unknown> = {}): GeoLocation {
  return {
    id: 'p1',
    name: 'Punto X',
    coordinates: { lat: 43.7, lng: -7.5 },
    createdAt: new Date(),
    updatedAt: new Date(),
    visibility: 'public',
    geoHealth: 'ok',
    ...extra,
  } as unknown as GeoLocation;
}

describe('shouldRenderMaturityBadge', () => {
  it('OFF cuando enabled=false (incluso con todo lo demás OK)', () => {
    expect(
      shouldRenderMaturityBadge({
        enabled: false,
        viewerUid: VIEWER,
        renderMode: 'standard',
        loc: poi({ ownerUserId: VIEWER }),
      }),
    ).toBe(false);
  });

  it('OFF sin viewerUid', () => {
    expect(
      shouldRenderMaturityBadge({
        enabled: true,
        viewerUid: null,
        renderMode: 'standard',
        loc: poi({ ownerUserId: VIEWER }),
      }),
    ).toBe(false);
  });

  it('OFF en renderMode micro o compact', () => {
    const cases: MarkerRenderMode[] = ['micro', 'compact'];
    for (const mode of cases) {
      expect(
        shouldRenderMaturityBadge({
          enabled: true,
          viewerUid: VIEWER,
          renderMode: mode,
          loc: poi({ ownerUserId: VIEWER }),
        }),
      ).toBe(false);
    }
  });

  it('ON en standard y rich sobre POI propio', () => {
    const cases: MarkerRenderMode[] = ['standard', 'rich'];
    for (const mode of cases) {
      expect(
        shouldRenderMaturityBadge({
          enabled: true,
          viewerUid: VIEWER,
          renderMode: mode,
          loc: poi({ ownerUserId: VIEWER }),
        }),
      ).toBe(true);
    }
  });

  it('OFF sobre POI seguido (paletteScope=owner-identity)', () => {
    expect(
      shouldRenderMaturityBadge({
        enabled: true,
        viewerUid: VIEWER,
        renderMode: 'rich',
        loc: poi({ ownerUserId: OTHER }),
      }),
    ).toBe(false);
  });

  it('OFF sobre POI app (paletteScope=app-neutral)', () => {
    expect(
      shouldRenderMaturityBadge({
        enabled: true,
        viewerUid: VIEWER,
        renderMode: 'rich',
        loc: poi({ sourceKind: 'app', sourceId: 'vandits-app', groupId: 'g' }),
      }),
    ).toBe(false);
  });

  it('OFF sobre POI source/external (paletteScope=source-neutral)', () => {
    expect(
      shouldRenderMaturityBadge({
        enabled: true,
        viewerUid: VIEWER,
        renderMode: 'rich',
        loc: poi({ sourceKind: 'external', sourceId: 'osm' }),
      }),
    ).toBe(false);
  });
});

describe('resolveMaturityBadgeStyle', () => {
  it('cubre los 11 niveles con bg hsl(...) y label "0".."10"', () => {
    for (let l = 0; l <= 10; l++) {
      const out = resolveMaturityBadgeStyle(l as 0);
      expect(out.label).toBe(String(l));
      expect(out.bg).toMatch(/^hsl\(\s*-?\d+\s+\d+%\s+\d+%\s*\)$/);
    }
  });

  it('niveles distintos pueden devolver bgs distintos', () => {
    const seen = new Set<string>();
    for (let l = 0; l <= 10; l++) {
      seen.add(resolveMaturityBadgeStyle(l as 0).bg);
    }
    // Al menos 6 colores distintos (algunos grupos comparten matiz).
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
