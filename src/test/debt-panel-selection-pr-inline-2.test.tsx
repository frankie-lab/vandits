/**
 * PR-INLINE-2 — Contract test para selección local inline en Mantener → Con deuda.
 *
 * Plan: docs/audits/search-filter-inline-poi-actions-plan.md
 *
 * Garantías DURAS cubiertas:
 *  - Checkbox POI marca/desmarca y NO abre popup (no llama setFocusedLocation).
 *  - Click en fila sigue abriendo popup (regresión PR-INLINE-1).
 *  - Checkbox grupo selecciona todos los ids visibles bajo el nodo.
 *  - Checkbox grupo deselecciona todos cuando estado es `all`.
 *  - Tri-state: subset seleccionado → indeterminate.
 *  - Cambio de universo visible (universeBaseIds) intersecta la selección.
 *  - Salir de modo `debt` limpia la selección.
 *  - Cero RPC / supabase.functions.invoke durante interacciones.
 *  - Selección local NO contamina el store global (mock no implementa `toggleGeoBranchSelection`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';

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
const toggleGeoBranchSelectionMock = vi.fn();
vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        setFocusedLocation: setFocusedLocationMock,
        toggleGeoBranchSelection: toggleGeoBranchSelectionMock,
      }),
    },
  ),
}));

vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: () => ({
    rootStatus: 'B',
    eligibleForAutoEnrich: false,
    reason: 't',
  }),
}));

vi.mock('@/domains/content/lib/point-health-rings', () => ({
  getPointHealthRings: () => ['partial'],
}));

vi.mock('@/shared/geography/hierarchy', () => ({
  getHierarchyBreadcrumb: () => '',
}));

import { TreePoiRow } from '@/components/filters/TreePoiRow';
import {
  DebtSelectionProvider,
  useDebtSelection,
} from '@/components/filters/DebtSelectionContext';

// Mini-mock del UniverseBaseContext para forzar mode + universeBaseIds.
type Mode = 'all' | 'debt' | 'unenriched' | 'selection' | 'filtered';
let currentMode: Mode = 'debt';
let currentIds: Set<string> = new Set(['p1', 'p2', 'p3']);
vi.mock('@/components/filters/UniverseBaseContext', () => ({
  useUniverseBase: () => ({
    mode: currentMode,
    universeBase: [],
    universeBaseIds: currentIds,
  }),
  UniverseBaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useScopedLocations: (f: unknown[]) => f,
}));

function loc(id: string) {
  return { id, name: id, latitude: 0, longitude: 0 } as any;
}

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
  requestSubsetFitMock.mockReset();
  setFocusedLocationMock.mockReset();
  toggleGeoBranchSelectionMock.mockReset();
  currentMode = 'debt';
  currentIds = new Set(['p1', 'p2', 'p3']);
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <DebtSelectionProvider>{children}</DebtSelectionProvider>;
}

// Hook helper para tests de tri-state / group / intersection / clear-on-mode.
function ApiProbe({ onApi }: { onApi: (api: ReturnType<typeof useDebtSelection>) => void }) {
  const api = useDebtSelection();
  React.useEffect(() => {
    onApi(api);
  });
  return null;
}

describe('PR-INLINE-2 — DebtSelection (local) + TreePoiRow checkbox', () => {
  it('checkbox POI marca/desmarca sin abrir popup', () => {
    render(
      <Wrapper>
        <TreePoiRow loc={loc('p1')} />
      </Wrapper>,
    );
    const cb = screen.getByRole('checkbox', { name: /Seleccionar p1/i });
    fireEvent.click(cb);
    expect(setFocusedLocationMock).not.toHaveBeenCalled();
    expect(requestSubsetFitMock).not.toHaveBeenCalled();
    const row = screen.getByRole('button', { name: /p1/i });
    expect(row.getAttribute('data-tree-poi-selected')).toBe('1');
    fireEvent.click(cb);
    expect(row.getAttribute('data-tree-poi-selected')).toBe('0');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('click en fila sigue abriendo popup (regresión PR-INLINE-1)', () => {
    render(
      <Wrapper>
        <TreePoiRow loc={loc('p1')} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /p1/i }));
    expect(setFocusedLocationMock).toHaveBeenCalledWith('p1');
    expect(requestSubsetFitMock).toHaveBeenCalledWith(['p1'], {
      mode: 'always',
      reason: 'tree-row-focus',
    });
  });

  it('toggleGroup selecciona todos los ids visibles bajo el nodo', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    act(() => api!.toggleGroup(['p1', 'p2', 'p3']));
    expect(api!.groupState(['p1', 'p2', 'p3'])).toBe('all');
    expect(api!.size).toBe(3);
  });

  it('toggleGroup deselecciona cuando el estado es `all`', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    act(() => api!.selectMany(['p1', 'p2', 'p3']));
    expect(api!.groupState(['p1', 'p2', 'p3'])).toBe('all');
    act(() => api!.toggleGroup(['p1', 'p2', 'p3']));
    expect(api!.groupState(['p1', 'p2', 'p3'])).toBe('none');
    expect(api!.size).toBe(0);
  });

  it('tri-state: subset seleccionado → partial', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    act(() => api!.toggle('p2'));
    expect(api!.groupState(['p1', 'p2', 'p3'])).toBe('partial');
  });

  it('rootStatusFilter recorta la selección al cambiar universeBaseIds', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    const { rerender } = render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    act(() => api!.selectMany(['p1', 'p2', 'p3']));
    expect(api!.size).toBe(3);
    // Simula que rootStatusFilter recorta universo a {p1}.
    act(() => {
      currentIds = new Set(['p1']);
    });
    rerender(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    expect(api!.size).toBe(1);
    expect(api!.isSelected('p1')).toBe(true);
    expect(api!.isSelected('p2')).toBe(false);
  });

  it('salir de mode=debt limpia la selección local', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    const { rerender } = render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    act(() => api!.selectMany(['p1', 'p2']));
    expect(api!.size).toBe(2);
    act(() => {
      currentMode = 'all';
    });
    rerender(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
      </Wrapper>,
    );
    expect(api!.size).toBe(0);
  });

  it('selección local NO contamina el store global (toggleGeoBranchSelection no se llama)', () => {
    render(
      <Wrapper>
        <TreePoiRow loc={loc('p1')} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Seleccionar p1/i }));
    expect(toggleGeoBranchSelectionMock).not.toHaveBeenCalled();
  });

  it('sin provider, TreePoiRow no renderiza checkbox (legacy intacto)', () => {
    render(<TreePoiRow loc={loc('p1')} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('cero RPC / edge functions durante toda la sesión de selección', () => {
    let api: ReturnType<typeof useDebtSelection> = null;
    render(
      <Wrapper>
        <ApiProbe onApi={(a) => (api = a)} />
        <TreePoiRow loc={loc('p1')} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Seleccionar p1/i }));
    act(() => api!.toggleGroup(['p1', 'p2', 'p3']));
    act(() => api!.clear());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
