import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import type { GeoLocation, KMLDocument } from '@/types/location';

function makeDoc(id: string, locations: Partial<GeoLocation>[] = []): KMLDocument {
  return {
    id,
    name: `Doc ${id}`,
    fileName: `${id}.kml`,
    locations: locations.map((l, i) => ({
      id: l.id || `loc-${id}-${i}`,
      name: l.name || `Location ${i}`,
      coordinates: l.coordinates || { lat: 40 + i, lng: -3 + i },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...l,
    })),
    uploadedAt: new Date(),
  };
}

describe('locations-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useLocationsStore.getState()._resetStoreState();
  });

  // ── CRUD ───────────────────────────────────────────────────

  it('addDocument adds a new document', () => {
    const doc = makeDoc('d1', [{ name: 'Place A' }]);
    useLocationsStore.getState().addDocument(doc);
    expect(useLocationsStore.getState().documents).toHaveLength(1);
    expect(useLocationsStore.getState().documents[0].id).toBe('d1');
  });

  it('addDocument upserts when id already exists', () => {
    const doc1 = makeDoc('d1', [{ name: 'V1' }]);
    const doc2 = makeDoc('d1', [{ name: 'V2' }]);
    useLocationsStore.getState().addDocument(doc1);
    useLocationsStore.getState().addDocument(doc2);
    expect(useLocationsStore.getState().documents).toHaveLength(1);
    expect(useLocationsStore.getState().documents[0].locations[0].name).toBe('V2');
  });

  it('removeDocument removes and clears selection', () => {
    const doc = makeDoc('d1', [{ id: 'loc-1', name: 'A' }]);
    useLocationsStore.getState().addDocument(doc);
    useLocationsStore.getState().toggleLocationSelection('loc-1');
    expect(useLocationsStore.getState().selectedLocations.size).toBe(1);

    useLocationsStore.getState().removeDocument('d1');
    expect(useLocationsStore.getState().documents).toHaveLength(0);
    expect(useLocationsStore.getState().selectedLocations.size).toBe(0);
  });

  it('updateLocation patches a specific location', () => {
    const doc = makeDoc('d1', [{ id: 'loc-1', name: 'Old' }]);
    useLocationsStore.getState().addDocument(doc);

    useLocationsStore.getState().updateLocation('loc-1', { name: 'New' });
    const loc = useLocationsStore.getState().documents[0].locations[0];
    expect(loc.name).toBe('New');
  });

  // ── Filters ────────────────────────────────────────────────

  it('setFilters preserves persistent filters on removeDocument', () => {
    useLocationsStore.getState().setFilters({
      ownershipFilter: 'mine',
      hiddenFollowedUserIds: ['user-a'],
      continent: 'Europa',
    });

    const doc = makeDoc('d1', []);
    useLocationsStore.getState().addDocument(doc);
    useLocationsStore.getState().removeDocument('d1');

    const filters = useLocationsStore.getState().filters;
    expect(filters.ownershipFilter).toBe('mine');
    expect(filters.hiddenFollowedUserIds).toEqual(['user-a']);
    // Non-persistent filters should be cleared
    expect(filters.continent).toBeUndefined();
  });

  // ── _docVersion ────────────────────────────────────────────

  it('_docVersion increments on mutations', () => {
    const v0 = useLocationsStore.getState()._docVersion;

    useLocationsStore.getState().addDocument(makeDoc('d1', [{ id: 'l1' }]));
    const v1 = useLocationsStore.getState()._docVersion;
    expect(v1).toBeGreaterThan(v0);

    useLocationsStore.getState().updateLocation('l1', { name: 'X' });
    const v2 = useLocationsStore.getState()._docVersion;
    expect(v2).toBeGreaterThan(v1);

    useLocationsStore.getState().removeDocument('d1');
    const v3 = useLocationsStore.getState()._docVersion;
    expect(v3).toBeGreaterThan(v2);
  });

  // ── Duplicates ─────────────────────────────────────────────

  it('addPendingDuplicates and removePendingDuplicate', () => {
    const dup = {
      newLocationId: 'new-1',
      existingLocationId: 'exist-1',
      distance: 100,
      newLocationName: 'New',
      existingLocationName: 'Existing',
      pairId: 'pair-1',
      newLocation: { id: 'new-1', name: 'New', coordinates: { lat: 40, lng: -3 }, createdAt: new Date(), updatedAt: new Date() } as any,
      existingLocation: { id: 'exist-1', name: 'Existing', coordinates: { lat: 40, lng: -3 }, createdAt: new Date(), updatedAt: new Date() } as any,
      threshold: 250,
      nameSimilarity: 0.8,
      descriptionSimilarity: 0,
    };
    useLocationsStore.getState().addPendingDuplicates([dup]);
    expect(useLocationsStore.getState().getPendingDuplicatesCount()).toBe(1);

    useLocationsStore.getState().removePendingDuplicate('new-1');
    expect(useLocationsStore.getState().getPendingDuplicatesCount()).toBe(0);
  });
});
