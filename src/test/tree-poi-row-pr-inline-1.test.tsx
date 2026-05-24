/**
 * PR-INLINE-1 — Contract test para TreePoiRow.
 *
 * Plan: docs/audits/search-filter-inline-poi-actions-plan.md
 *
 * Garantías DURAS cubiertas:
 *  - Fila POI renderiza root status (A/B/C/D), ring hint y nombre.
 *  - Click en fila → setFocusedLocation(id) + requestSubsetFit([id], 'tree-row-focus').
 *  - Botón mapa → requestSubsetFit([id], 'tree-row-map-button') y NO setFocusedLocation.
 *  - Botón mapa hace stopPropagation (no dispara click de fila).
 *  - Render no llama supabase.rpc ni supabase.functions.invoke.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

const rpcMock = vi.fn();
const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const requestSubsetFitMock = vi.fn();
vi.mock('@/components/map/subset-fit', () => ({
  requestSubsetFit: (...args: unknown[]) => requestSubsetFitMock(...args),
}));

const setFocusedLocationMock = vi.fn();
vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    () => ({}),
    { getState: () => ({ setFocusedLocation: setFocusedLocationMock }) },
  ),
}));

vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root =
      p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: false, reason: 't' };
  },
}));

vi.mock('@/domains/content/lib/point-health-rings', () => ({
  getPointHealthRings: (l: { id: string }) =>
    l.id.includes('partial') ? ['partial'] : [],
}));

vi.mock('@/shared/geography/hierarchy', () => ({
  getHierarchyBreadcrumb: () => 'Europe / France',
}));

import { TreePoiRow } from '@/components/filters/TreePoiRow';

function loc(id: string, name = id): GeoLocation {
  return { id, name, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
  requestSubsetFitMock.mockReset();
  setFocusedLocationMock.mockReset();
});

describe('PR-INLINE-1 — TreePoiRow', () => {
  it('renderiza root status, ring hint y nombre, sin llamar a Supabase', () => {
    render(<TreePoiRow loc={loc('b-partial-1', 'Passage du Gois')} />);
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('partial')).toBeTruthy();
    expect(screen.getByText('Passage du Gois')).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(requestSubsetFitMock).not.toHaveBeenCalled();
    expect(setFocusedLocationMock).not.toHaveBeenCalled();
  });

  it('oculta ring hint cuando no hay rings', () => {
    render(<TreePoiRow loc={loc('d-clean', 'Sin deuda')} />);
    expect(screen.queryByText('partial')).toBeNull();
    expect(screen.queryByText('chain')).toBeNull();
  });

  it('click en fila → setFocusedLocation(id) + requestSubsetFit([id], "tree-row-focus")', () => {
    render(<TreePoiRow loc={loc('b-partial-1', 'X')} />);
    const row = screen.getByRole('button', { name: /X/i });
    fireEvent.click(row);
    expect(setFocusedLocationMock).toHaveBeenCalledTimes(1);
    expect(setFocusedLocationMock).toHaveBeenCalledWith('b-partial-1');
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    expect(requestSubsetFitMock).toHaveBeenCalledWith(['b-partial-1'], {
      mode: 'always',
      reason: 'tree-row-focus',
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('botón mapa → requestSubsetFit("tree-row-map-button") y NO setFocusedLocation', () => {
    render(<TreePoiRow loc={loc('d-partial-7', 'Y')} />);
    const mapBtn = screen.getByRole('button', { name: /Centrar mapa/i });
    fireEvent.click(mapBtn);
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    expect(requestSubsetFitMock).toHaveBeenCalledWith(['d-partial-7'], {
      mode: 'always',
      reason: 'tree-row-map-button',
    });
    expect(setFocusedLocationMock).not.toHaveBeenCalled();
  });

  it('botón mapa NO dispara también el click de fila (stopPropagation)', () => {
    render(<TreePoiRow loc={loc('b-partial-9', 'Z')} />);
    const mapBtn = screen.getByRole('button', { name: /Centrar mapa/i });
    fireEvent.click(mapBtn);
    // setFocusedLocation se llamaría sólo si el click de fila se hubiese
    // propagado. Con stopPropagation, no se llama.
    expect(setFocusedLocationMock).not.toHaveBeenCalled();
    // requestSubsetFit se llamó UNA sola vez (la del botón), no dos.
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    expect(requestSubsetFitMock.mock.calls[0][1]).toMatchObject({
      reason: 'tree-row-map-button',
    });
  });
});
