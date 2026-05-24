/**
 * Tests — RootStatusChipRow (PR-FILTER-ROOTSTATUS-2.2 §C).
 *
 * Cubre:
 *   - Counts derivados del scope (A+B+C+D == scope.length).
 *   - Toggle añade/quita la letra del array `filters.rootStatus`.
 *   - Sin selección y con selección activan el badge `data-selection-active`.
 *   - hideWhenEmpty oculta el row.
 *   - El row NUNCA muta filters fuera del eje `rootStatus`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: vi.fn(),
}));

import { classifyPoiRootStatusForLocation } from '@/domains/content/lib/poi-identity-root-status-client';
import { RootStatusChipRow } from '@/components/discovery/RootStatusChipRow';

const mockClassify = classifyPoiRootStatusForLocation as unknown as ReturnType<typeof vi.fn>;

function loc(id: string) {
  return { id } as unknown;
}

function setRoots(map: Record<string, 'A' | 'B' | 'C' | 'D'>) {
  mockClassify.mockImplementation((l?: { id?: string }) => {
    const key = l?.id ?? '';
    const root = map[key] ?? 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  });
}

beforeEach(() => mockClassify.mockReset());

describe('RootStatusChipRow', () => {
  it('renderiza counts A/B/C/D y suma == scope.length', () => {
    setRoots({ a1: 'A', b1: 'B', c1: 'C', d1: 'D', d2: 'D' });
    render(
      <RootStatusChipRow
        scopeLocations={[loc('a1'), loc('b1'), loc('c1'), loc('d1'), loc('d2')]}
        filters={{}}
        setFilters={() => {}}
      />,
    );
    expect(screen.getByTestId('root-status-chip-A')).toHaveTextContent('A 1');
    expect(screen.getByTestId('root-status-chip-B')).toHaveTextContent('B 1');
    expect(screen.getByTestId('root-status-chip-C')).toHaveTextContent('C 1');
    expect(screen.getByTestId('root-status-chip-D')).toHaveTextContent('D 2');
    expect(screen.getByTestId('root-status-chip-row')).toHaveAttribute(
      'data-scope-total',
      '5',
    );
  });

  it('toggle añade la letra y un segundo click la quita', () => {
    setRoots({ d1: 'D' });
    const setFilters = vi.fn();
    const { rerender } = render(
      <RootStatusChipRow
        scopeLocations={[loc('d1')]}
        filters={{}}
        setFilters={setFilters}
      />,
    );
    fireEvent.click(screen.getByTestId('root-status-chip-D'));
    expect(setFilters).toHaveBeenLastCalledWith({ rootStatus: ['D'] });

    rerender(
      <RootStatusChipRow
        scopeLocations={[loc('d1')]}
        filters={{ rootStatus: ['D'] }}
        setFilters={setFilters}
      />,
    );
    fireEvent.click(screen.getByTestId('root-status-chip-D'));
    // Segundo click: rootStatus debe quedar OUT (next.length === 0 ⇒ delete).
    const last = setFilters.mock.calls.at(-1)![0];
    expect(last.rootStatus).toBeUndefined();
  });

  it('hideWhenEmpty oculta el row si scope está vacío', () => {
    setRoots({});
    const { container } = render(
      <RootStatusChipRow scopeLocations={[]} filters={{}} setFilters={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marca selectionActive en el data-attribute', () => {
    setRoots({ d1: 'D' });
    render(
      <RootStatusChipRow
        scopeLocations={[loc('d1')]}
        filters={{}}
        setFilters={() => {}}
        selectionActive
      />,
    );
    expect(screen.getByTestId('root-status-chip-row')).toHaveAttribute(
      'data-selection-active',
      'true',
    );
  });

  it('toggle no toca otros ejes de filters', () => {
    setRoots({ d1: 'D' });
    const setFilters = vi.fn();
    render(
      <RootStatusChipRow
        scopeLocations={[loc('d1')]}
        filters={{ healthFilter: 'partial', search: 'foo' } as never}
        setFilters={setFilters}
      />,
    );
    fireEvent.click(screen.getByTestId('root-status-chip-D'));
    const payload = setFilters.mock.calls.at(-1)![0];
    expect(payload.healthFilter).toBe('partial');
    expect(payload.search).toBe('foo');
    expect(payload.rootStatus).toEqual(['D']);
  });
});
