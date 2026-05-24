/**
 * Tests — PR-FILTER-ROOTSTATUS-2.1
 *
 * Verifica que `partitionRepairScopeByRootStatus` cumple las invariantes
 * del gating de "Resolver deuda":
 *   - D + partial|chain → repairableIds (los únicos que entran a RPC).
 *   - D + hardError|review → nonRepairableByType.
 *   - A → identityIncomplete (nunca en repairableIds).
 *   - B → systemDebt (nunca en repairableIds).
 *   - C → review (nunca en repairableIds).
 *   - Partición sin solapes, sum == total.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: vi.fn(),
}));

import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import { partitionRepairScopeByRootStatus } from '@/components/discovery/health-repair-partition';
import type { GeoLocation } from '@/types/location';

const mockClassify = classifyPoiRootStatusForLocation as unknown as ReturnType<typeof vi.fn>;

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

function setRoots(map: Record<string, 'A' | 'B' | 'C' | 'D'>) {
  mockClassify.mockImplementation((l: GeoLocation) => ({
    rootStatus: map[l.id] ?? 'D',
    eligibleForAutoEnrich: (map[l.id] ?? 'D') === 'D',
    reason: 'test',
  }));
}

beforeEach(() => {
  mockClassify.mockReset();
});

describe('partitionRepairScopeByRootStatus — repairableIds', () => {
  it('D + partial → repairable', () => {
    setRoots({ d1: 'D' });
    const r = partitionRepairScopeByRootStatus([loc('d1')], 'partial');
    expect(r.repairableIds).toEqual(['d1']);
    expect(r.repairable).toHaveLength(1);
  });

  it('D + chain → repairable', () => {
    setRoots({ d1: 'D' });
    const r = partitionRepairScopeByRootStatus([loc('d1')], 'chain');
    expect(r.repairableIds).toEqual(['d1']);
  });

  it('D + hardError → NO entra en repairableIds (nonRepairableByType)', () => {
    setRoots({ d1: 'D' });
    const r = partitionRepairScopeByRootStatus([loc('d1')], 'hardError');
    expect(r.repairableIds).toEqual([]);
    expect(r.nonRepairableByType).toHaveLength(1);
  });

  it('D + review → NO entra en repairableIds (nonRepairableByType)', () => {
    setRoots({ d1: 'D' });
    const r = partitionRepairScopeByRootStatus([loc('d1')], 'review');
    expect(r.repairableIds).toEqual([]);
    expect(r.nonRepairableByType).toHaveLength(1);
  });

  it('A nunca entra en repairableIds (sea cual sea filter)', () => {
    setRoots({ a1: 'A' });
    for (const f of ['partial', 'chain', 'hardError', 'review'] as const) {
      const r = partitionRepairScopeByRootStatus([loc('a1')], f);
      expect(r.repairableIds).toEqual([]);
      expect(r.identityIncomplete).toHaveLength(1);
    }
  });

  it('B nunca entra en repairableIds', () => {
    setRoots({ b1: 'B' });
    for (const f of ['partial', 'chain', 'hardError', 'review'] as const) {
      const r = partitionRepairScopeByRootStatus([loc('b1')], f);
      expect(r.repairableIds).toEqual([]);
      expect(r.systemDebt).toHaveLength(1);
    }
  });

  it('C nunca entra en repairableIds', () => {
    setRoots({ c1: 'C' });
    for (const f of ['partial', 'chain', 'hardError', 'review'] as const) {
      const r = partitionRepairScopeByRootStatus([loc('c1')], f);
      expect(r.repairableIds).toEqual([]);
      expect(r.review).toHaveLength(1);
    }
  });
});

describe('partitionRepairScopeByRootStatus — mixed groups', () => {
  it('mixed A/B/C/D produce grupos correctos sin solapes, suma == total', () => {
    setRoots({ a1: 'A', b1: 'B', c1: 'C', d1: 'D', d2: 'D' });
    const r = partitionRepairScopeByRootStatus(
      [loc('a1'), loc('b1'), loc('c1'), loc('d1'), loc('d2')],
      'partial',
    );
    expect(r.identityIncomplete.map((l) => l.id)).toEqual(['a1']);
    expect(r.systemDebt.map((l) => l.id)).toEqual(['b1']);
    expect(r.review.map((l) => l.id)).toEqual(['c1']);
    expect(r.repairableIds.sort()).toEqual(['d1', 'd2']);
    expect(r.nonRepairableByType).toEqual([]);
    const sum =
      r.repairable.length +
      r.systemDebt.length +
      r.review.length +
      r.identityIncomplete.length +
      r.nonRepairableByType.length;
    expect(sum).toBe(r.total);
    expect(r.total).toBe(5);
  });

  it('mixed con filter=hardError: D va a nonRepairableByType', () => {
    setRoots({ a1: 'A', d1: 'D' });
    const r = partitionRepairScopeByRootStatus([loc('a1'), loc('d1')], 'hardError');
    expect(r.repairableIds).toEqual([]);
    expect(r.identityIncomplete.map((l) => l.id)).toEqual(['a1']);
    expect(r.nonRepairableByType.map((l) => l.id)).toEqual(['d1']);
  });

  it('scope vacío → todos los grupos vacíos', () => {
    setRoots({});
    const r = partitionRepairScopeByRootStatus([], 'partial');
    expect(r.total).toBe(0);
    expect(r.repairableIds).toEqual([]);
  });
});
