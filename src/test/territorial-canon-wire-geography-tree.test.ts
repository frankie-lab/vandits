/**
 * T2A-wire — Contract test: GeographyTree colapsa el nivel Provincia
 * cuando el país tiene `hasProvincia=false`.
 *
 * No es un test de render (DOM); valida la transformación pura sobre el
 * árbol producido por `groupLocationsByHierarchy`, que es la unidad
 * cubierta por el wire en `GeographyTree.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { groupLocationsByHierarchy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

function makeLoc(partial: Partial<GeoLocation>): GeoLocation {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'Test',
    coordinates: { lat: 0, lng: 0 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    visibility: 'followers',
    ...partial,
  } as GeoLocation;
}

describe('T2A-wire — GeographyTree depth via getLocationHierarchy', () => {
  it('SE: zone se descarta en hierarchy → tree no tiene rama Provincia útil', () => {
    const nodes = groupLocationsByHierarchy([
      makeLoc({ country: 'Sweden', region: 'Stockholm', zone: 'GHOST', enrichedData: { datos_geograficos: { localidad: 'Stockholm' } } as any }),
    ]);
    // Continente → Country
    const europe = nodes.find((n) => /europ/i.test(n.value));
    expect(europe).toBeDefined();
    const sweden = europe!.children.find((n) => /sweden/i.test(n.value));
    expect(sweden).toBeDefined();
    // El nivel zone existe en el árbol crudo como placeholder (UNCLASSIFIED_VALUE)
    // pero NO contiene el valor "GHOST" — la regla del canon lo eliminó.
    const region = sweden!.children.find((n) => /stockholm/i.test(n.value));
    expect(region).toBeDefined();
    const zoneLevel = region!.children;
    for (const z of zoneLevel) {
      expect(z.value).not.toBe('GHOST');
    }
  });

  it('PT: zone se mantiene (hasProvincia=true)', () => {
    const nodes = groupLocationsByHierarchy([
      makeLoc({ country: 'Portugal', region: 'Norte', zone: 'Braga' }),
    ]);
    const europe = nodes.find((n) => /europ/i.test(n.value))!;
    const pt = europe.children.find((n) => /portugal/i.test(n.value))!;
    const norte = pt.children.find((n) => /norte/i.test(n.value))!;
    const braga = norte.children.find((n) => /braga/i.test(n.value));
    expect(braga).toBeDefined();
  });

  it('AR/CABA: zone colapsa porque region==zone whitelisted', () => {
    const nodes = groupLocationsByHierarchy([
      makeLoc({
        country: 'Argentina',
        region: 'Ciudad Autónoma de Buenos Aires',
        zone: 'Ciudad Autónoma de Buenos Aires',
      }),
    ]);
    const america = nodes.find((n) => /amer/i.test(n.value))!;
    const ar = america.children.find((n) => /argentina/i.test(n.value))!;
    const caba = ar.children.find((n) => /ciudad/i.test(n.value))!;
    // Ningún hijo zone reproduce CABA — el canon lo colapsó.
    for (const z of caba.children) {
      expect(z.value).not.toBe('Ciudad Autónoma de Buenos Aires');
    }
  });
});
