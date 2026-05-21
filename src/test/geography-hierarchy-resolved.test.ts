// T1-fix — orden canónico de lectura textual:
//   *Resolved (FK SoT) → legacy text → enriched_data.datos_geograficos.*
//
// Ref:
//   - docs/contracts/territorial-equivalence-canon.md § "SoT textual cliente"
//   - docs/audits/t1-zone-text-null-with-zone-id-dry-run.md
import { describe, it, expect } from 'vitest';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

function makeLoc(partial: Partial<GeoLocation>): GeoLocation {
  return {
    id: 't-1',
    name: 'Test',
    coordinates: { lat: 41.4, lng: 2.1 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    visibility: 'followers',
    ...partial,
  } as GeoLocation;
}

describe('getLocationHierarchy — T1-fix *Resolved canon', () => {
  describe('zone', () => {
    it('sólo zoneResolved → nodo correcto', () => {
      const h = getLocationHierarchy(makeLoc({ zoneResolved: 'Barcelona' }));
      expect(h.zone).toBe('Barcelona');
    });

    it('zoneResolved + legacy zone distintos → gana zoneResolved', () => {
      const h = getLocationHierarchy(makeLoc({ zoneResolved: 'Barcelona', zone: 'LEGACY' }));
      expect(h.zone).toBe('Barcelona');
    });

    it('sólo legacy zone → fallback funciona', () => {
      const h = getLocationHierarchy(makeLoc({ zone: 'Zaragoza' }));
      expect(h.zone).toBe('Zaragoza');
    });

    it('sólo enriched_data.datos_geograficos.admin_nivel_2 → fallback final', () => {
      const h = getLocationHierarchy(
        makeLoc({
          enrichedData: {
            datos_geograficos: { admin_nivel_2: 'Madrid' },
          } as any,
        }),
      );
      expect(h.zone).toBe('Madrid');
    });

    it('los tres presentes → gana zoneResolved', () => {
      const h = getLocationHierarchy(
        makeLoc({
          zoneResolved: 'WINNER',
          zone: 'LOSER',
          enrichedData: {
            datos_geograficos: { admin_nivel_2: 'ALSO_LOSER' },
          } as any,
        }),
      );
      expect(h.zone).toBe('WINNER');
    });
  });

  describe('region', () => {
    it('regionResolved gana sobre legacy y enriched', () => {
      const h = getLocationHierarchy(
        makeLoc({
          regionResolved: 'Cataluña',
          region: 'LEGACY',
          enrichedData: { datos_geograficos: { admin_nivel_1: 'GD' } } as any,
        }),
      );
      expect(h.region).toBe('Cataluña');
    });

    it('fallback a enriched cuando no hay resolved ni legacy', () => {
      const h = getLocationHierarchy(
        makeLoc({ enrichedData: { datos_geograficos: { admin_nivel_1: 'Aragón' } } as any }),
      );
      expect(h.region).toBe('Aragón');
    });
  });

  describe('admin_level_3 (comarca)', () => {
    it('admin3Resolved gana sobre comarca y enriched', () => {
      const h = getLocationHierarchy(
        makeLoc({
          admin3Resolved: 'Barcelonès',
          comarca: 'LEGACY',
          enrichedData: { datos_geograficos: { admin_nivel_3: 'GD' } } as any,
        }),
      );
      expect(h.admin_level_3).toBe('Barcelonès');
    });
  });

  describe('locality', () => {
    it('localityResolved gana sobre localidad y enriched', () => {
      const h = getLocationHierarchy(
        makeLoc({
          localityResolved: 'Barcelona',
          localidad: 'LEGACY',
          enrichedData: { datos_geograficos: { localidad: 'GD' } } as any,
        }),
      );
      expect(h.locality).toBe('Barcelona');
    });
  });
});
