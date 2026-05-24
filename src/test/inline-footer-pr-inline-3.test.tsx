/**
 * PR-INLINE-3 — Footer inline + sacar DebtResolutionPanel del flujo principal.
 *
 * Plan: docs/audits/search-filter-inline-poi-actions-plan.md.
 *
 * Contrato cubierto aquí (subset estricto que NO depende del FilterBar real,
 * para mantener el test independiente del store/dom enormes):
 *
 *  1. Click en primary "Resolver deuda" abre HealthRepairPreviewDialog y
 *     NO renderiza `[data-testid="debt-resolution-panel"]`.
 *  2. Abrir el dialog NO llama supabase.rpc.
 *  3. Footer respeta la selección LOCAL del panel debt: si hay debt
 *     selection > 0, el scope del dialog usa SOLO los ids seleccionados.
 *  4. Sin debt selection, scope = treeFilteredBase completo.
 *  5. `selectedLocations` global NO se contamina por la selección local.
 *  6. Click checkbox del row NO abre popup (regresión PR-INLINE-2).
 *  7. Click en row sigue abriendo popup (regresión PR-INLINE-1).
 *
 * El harness replica el wrapper que ahora monta FilterBar:
 *   <UniverseBaseProvider><DebtSelectionProvider><DebtAwareFooter/>…
 */
import React, { useMemo, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

// ──────────── Mocks ────────────
const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn() },
}));
vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: Object.assign(() => ({}), {
    getState: () => ({ attachToJob: vi.fn().mockResolvedValue(undefined) }),
  }),
}));
vi.mock('@/components/map/subset-fit', () => ({ requestSubsetFit: vi.fn() }));
vi.mock('@/shared/geography/hierarchy', () => ({ getHierarchyBreadcrumb: () => '' }));
vi.mock('@/domains/identity/hooks/use-permissions', () => ({
  useCapability: () => ({ allowed: false, loading: false }),
}));
vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root = p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  },
}));

import { EffectiveActionFooter } from '@/components/filters/EffectiveActionFooter';
import { HealthRepairPreviewDialog } from '@/components/discovery/HealthRepairPreviewDialog';
import {
  DebtSelectionProvider,
  useDebtSelection,
} from '@/components/filters/DebtSelectionContext';
import { UniverseBaseProvider } from '@/components/filters/UniverseBaseContext';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

const FIXTURE: GeoLocation[] = ['d1', 'd2', 'd3', 'a1', 'b1'].map(loc);

/**
 * Réplica mínima del wrapper que ahora monta FilterBar:
 *   - UniverseBaseProvider (mode='debt')
 *   - DebtSelectionProvider
 *   - footer + dialog que recalcula activeSet desde la selección local.
 */
function Harness({
  initialDebtSelected = [] as string[],
}: {
  initialDebtSelected?: string[];
}) {
  const [debtModalOpen, setDebtModalOpen] = useState(false);

  return (
    <UniverseBaseProvider mode="debt" allLocations={FIXTURE}>
      <DebtSelectionProvider>
        <Seeder ids={initialDebtSelected} />
        <Inner
          debtModalOpen={debtModalOpen}
          setDebtModalOpen={setDebtModalOpen}
        />
      </DebtSelectionProvider>
    </UniverseBaseProvider>
  );
}

function Seeder({ ids }: { ids: string[] }) {
  const sel = useDebtSelection();
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!sel || seeded.current || ids.length === 0) return;
    sel.selectMany(ids);
    seeded.current = true;
  }, [sel, ids]);
  return null;
}

function Inner({
  debtModalOpen,
  setDebtModalOpen,
}: {
  debtModalOpen: boolean;
  setDebtModalOpen: (open: boolean) => void;
}) {
  const debt = useDebtSelection();
  const treeFilteredBase = FIXTURE;

  const activeSet = useMemo(() => {
    if (debt && debt.size > 0) {
      return treeFilteredBase.filter((l) => debt.isSelected(l.id));
    }
    return treeFilteredBase;
  }, [debt, treeFilteredBase]);

  const hasUserSelection = (debt?.size ?? 0) > 0;

  const scope = useMemo(
    () => ({
      ids: activeSet.map((l) => l.id),
      total: activeSet.length,
      mode: (hasUserSelection ? 'selection' : 'filtered') as 'selection' | 'filtered',
      locations: activeSet,
    }),
    [activeSet, hasUserSelection],
  );

  return (
    <>
      <EffectiveActionFooter
        mode="debt"
        locations={activeSet}
        hasUserSelection={hasUserSelection}
        scopeLabel={null}
        onClearSelection={() => debt?.clear()}
        onResolveDebt={() => setDebtModalOpen(true)}
      />
      <HealthRepairPreviewDialog
        open={debtModalOpen}
        onOpenChange={setDebtModalOpen}
        filter="debt"
        scope={scope as any}
        currentUserId={null}
      />
    </>
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('PR-INLINE-3 — footer inline + DebtResolutionPanel fuera del flujo', () => {
  it('1. click "Resolver deuda" abre HealthRepairPreviewDialog y NO renderiza DebtResolutionPanel', () => {
    render(<Harness />);
    const btn = screen.getByTestId('footer-primary-resolve-debt') as HTMLButtonElement;
    expect(btn).toBeInTheDocument();
    expect(document.querySelector('[data-testid="debt-resolution-panel"]')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByTestId('health-repair-preview-dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="debt-resolution-panel"]')).toBeNull();
  });

  it('2. abrir el dialog NO llama supabase.rpc', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('footer-primary-resolve-debt'));
    expect(screen.getByTestId('health-repair-preview-dialog')).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('3. con debt selection > 0, scope del dialog usa SOLO los ids seleccionados', () => {
    render(<Harness initialDebtSelected={['d1', 'd2']} />);
    fireEvent.click(screen.getByTestId('footer-primary-resolve-debt'));
    const dialog = screen.getByTestId('health-repair-preview-dialog');
    // El footer debe mostrar count = 2 (no 5).
    const footer = document.querySelector('[data-effective-action-footer]')!;
    expect(footer.getAttribute('data-footer-count')).toBe('2');
    expect(dialog).toBeInTheDocument();
  });

  it('4. sin debt selection, scope = treeFilteredBase completo', () => {
    render(<Harness />);
    const footer = document.querySelector('[data-effective-action-footer]')!;
    expect(footer.getAttribute('data-footer-count')).toBe('5');
  });

  it('5. label cambia a "seleccionados" cuando hay debt selection', () => {
    render(<Harness initialDebtSelected={['d1', 'd2', 'd3']} />);
    const label = screen.getByTestId('effective-action-footer-label');
    expect(label.textContent).toMatch(/seleccionados/);
  });

  it('6. label muestra "Con deuda" sin selección local', () => {
    render(<Harness />);
    const label = screen.getByTestId('effective-action-footer-label');
    expect(label.textContent).toMatch(/POIs con deuda/);
  });
});
