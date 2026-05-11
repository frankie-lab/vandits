import { describe, it, expect } from 'vitest';
import { applyCatalogSnapshotPure } from '@/domains/content/store/catalog-snapshot';
import type { KMLDocument, GeoLocation } from '@/types/location';

const mkLoc = (id: string, name = id, lat = 0, lng = 0, ts = 1): GeoLocation => ({
  id, name,
  coordinates: { lat, lng },
  visibility: 'followers',
  isApproved: true,
  createdAt: new Date(ts),
  updatedAt: new Date(ts),
});

const mkDoc = (id: string, userId: string, locs: GeoLocation[]): KMLDocument => ({
  id, name: id, fileName: id, locations: locs, uploadedAt: new Date(1), userId,
});

describe('applyCatalogSnapshotPure', () => {
  it('scope=mine does not touch social docs', () => {
    const prev = [mkDoc('a', 'u1', [mkLoc('l1')]), mkDoc('b', 'u2', [mkLoc('l2')])];
    const { documents, mutated } = applyCatalogSnapshotPure(
      prev, [mkDoc('a', 'u1', [mkLoc('l1')])],
      { ownerScope: 'mine', currentUserId: 'u1' },
    );
    expect(mutated).toBe(false);
    expect(documents).toBe(prev);
  });

  it('preserves location reference when render+data hashes match', () => {
    const loc = mkLoc('l1');
    const prev = [mkDoc('a', 'u1', [loc])];
    const { documents } = applyCatalogSnapshotPure(
      prev, [mkDoc('a', 'u1', [mkLoc('l1')])],
      { ownerScope: 'mine', currentUserId: 'u1' },
    );
    expect(documents[0].locations[0]).toBe(loc);
  });

  it('replaces location when data hash changes (updatedAt)', () => {
    const prev = [mkDoc('a', 'u1', [mkLoc('l1', 'X', 0, 0, 1)])];
    const next = [mkDoc('a', 'u1', [mkLoc('l1', 'X', 0, 0, 2)])];
    const { documents, mutated } = applyCatalogSnapshotPure(
      prev, next, { ownerScope: 'mine', currentUserId: 'u1' },
    );
    expect(mutated).toBe(true);
    expect(documents[0].locations[0]).not.toBe(prev[0].locations[0]);
  });

  it('removes doc missing in snapshot within scope and reports removed ids', () => {
    const prev = [mkDoc('a', 'u1', [mkLoc('l1'), mkLoc('l2')])];
    const { documents, mutated, removedLocationIds } = applyCatalogSnapshotPure(
      prev, [], { ownerScope: 'mine', currentUserId: 'u1' },
    );
    expect(mutated).toBe(true);
    expect(documents).toHaveLength(0);
    expect(removedLocationIds.has('l1')).toBe(true);
    expect(removedLocationIds.has('l2')).toBe(true);
  });

  it('adds new doc in scope=all', () => {
    const { documents, mutated } = applyCatalogSnapshotPure(
      [], [mkDoc('a', 'u1', [mkLoc('l1')])],
      { ownerScope: 'all', currentUserId: 'u1' },
    );
    expect(mutated).toBe(true);
    expect(documents).toHaveLength(1);
  });
});
