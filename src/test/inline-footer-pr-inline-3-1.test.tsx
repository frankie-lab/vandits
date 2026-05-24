/**
 * PR-INLINE-3.1 — Footer "Resolver deuda" sin reparables.
 *
 * Regla dura: HealthRepairPreviewDialog SOLO se abre si repairableIds.length > 0
 * (D ∩ {partial, chain}). Sin reparables, el primary cambia a Geo Maintenance
 * (si todo el activeSet es B + capability) o Exportar.
 *
 * Tests cableados al `EffectiveActionFooter` directamente con `mode='debt'`
 * y `partitionRepairScopeByRootStatus` real (mockeando solo helpers de
 * clasificación y rings). Sin store, sin FilterBar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

// Polyfills jsdom para Radix DropdownMenu (pointer capture + scrollIntoView).
beforeEach(() => {
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
    (Element.prototype as any).releasePointerCapture = () => {};
    (Element.prototype as any).setPointerCapture = () => {};
  }
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = () => {};
  }
});

function openMenu() {
  const trigger = document.querySelector('[data-testid="footer-more-actions"]') as HTMLButtonElement;
  expect(trigger).toBeTruthy();
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' });
  });
}


// ──────────── Mocks ────────────
const rpcMock = vi.fn();
const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    from: () => ({ update: () => ({ in: () => Promise.resolve({ error: null }) }) }),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}));
const requestSubsetFitMock = vi.fn();
vi.mock('@/components/map/subset-fit', () => ({
  requestSubsetFit: (...a: unknown[]) => requestSubsetFitMock(...a),
}));
const dispatchHandoffMock = vi.fn();
const navigateMock = vi.fn();
vi.mock('@/shared/events/geo-maintenance-handoff', () => ({
  dispatchGeoMaintenanceHandoff: (...a: unknown[]) => dispatchHandoffMock(...a),
  navigateToGeoMaintenance: (...a: unknown[]) => navigateMock(...a),
}));

// Clasificación: prefijo del id → Root Status.
//   d* → D, b* → B, c* → C, a* → A.
vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root = p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  },
}));

// Rings: ids "d-partial-*" → ['partial'], "d-chain-*" → ['chain'], resto [].
vi.mock('@/domains/content/lib/point-health-rings', () => ({
  getPointHealthRings: (l: { id: string }) => {
    if (l.id.startsWith('d-partial')) return ['partial'];
    if (l.id.startsWith('d-chain')) return ['chain'];
    return [];
  },
}));

// isPointEnriched no afecta debt; devolver true para evitar enrichCount > 0.
vi.mock('@/domains/content/lib/point-visual-state', () => ({
  isPointEnriched: () => true,
  getPointVisualState: () => 'enriched',
}));

import { EffectiveActionFooter } from '@/components/filters/EffectiveActionFooter';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

function mount(opts: {
  ids: string[];
  canView?: boolean;
  canRun?: boolean;
  onResolveDebt?: () => void;
}) {
  const onResolveDebt = opts.onResolveDebt ?? vi.fn();
  const utils = render(
    <EffectiveActionFooter
      mode="debt"
      locations={opts.ids.map(loc)}
      hasUserSelection={false}
      scopeLabel={null}
      onClearSelection={() => {}}
      onResolveDebt={onResolveDebt}
      canViewGeoMaintenance={!!opts.canView}
      canRunGeoBackfill={!!opts.canRun}
    />,
  );
  return { ...utils, onResolveDebt };
}

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
  requestSubsetFitMock.mockReset();
  dispatchHandoffMock.mockReset();
  navigateMock.mockReset();
});

describe('PR-INLINE-3.1 — footer sin reparables no abre HealthRepairPreviewDialog', () => {
  it('1. 0 reparables + todo B + capability → primary Geo Maintenance; click NO invoca onResolveDebt', () => {
    const onResolveDebt = vi.fn();
    mount({ ids: ['b1', 'b2', 'b3'], canView: true, canRun: true, onResolveDebt });
    const btn = screen.getByTestId('footer-primary-geo-maintenance');
    expect(btn).toBeInTheDocument();
    expect(screen.queryByTestId('footer-primary-resolve-debt')).toBeNull();
    fireEvent.click(btn);
    expect(onResolveDebt).not.toHaveBeenCalled();
    expect(dispatchHandoffMock).toHaveBeenCalledTimes(1);
    expect(dispatchHandoffMock.mock.calls[0][0].locationIds).toEqual(['b1', 'b2', 'b3']);
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it('2. 0 reparables + sin capability → primary Exportar (NUNCA Geo Maintenance)', () => {
    mount({ ids: ['b1', 'b2'], canView: false, canRun: false });
    expect(screen.queryByTestId('footer-primary-geo-maintenance')).toBeNull();
    expect(screen.queryByTestId('footer-primary-resolve-debt')).toBeNull();
    expect(screen.getByTestId('footer-primary-export')).toBeInTheDocument();
  });

  it('3. activeSet mixto B/C/no-rep → primary Exportar + hint visible', () => {
    mount({ ids: ['b1', 'c1', 'd1', 'a1'], canView: true, canRun: true });
    expect(screen.getByTestId('footer-primary-export')).toBeInTheDocument();
    expect(screen.queryByTestId('footer-primary-resolve-debt')).toBeNull();
    expect(screen.getByTestId('footer-debt-no-repairables-hint').textContent).toMatch(
      /No hay POIs reparables automáticamente/,
    );
  });

  it('4. Más acciones incluye Geo Maintenance B (si hay B + capability) y Abrir en mapa', () => {
    mount({ ids: ['b1', 'b2', 'c1'], canView: true, canRun: true });
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    expect(screen.getByTestId('footer-menu-geo-maintenance-b')).toBeInTheDocument();
    expect(screen.getByTestId('footer-menu-focus-map')).toBeInTheDocument();
    expect(screen.getByTestId('footer-menu-export-non-repairable')).toBeInTheDocument();
  });

  it('5. Abrir en mapa usa requestSubsetFit (helper canónico) con reason canon', () => {
    mount({ ids: ['b1', 'c1'], canView: false, canRun: false });
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    fireEvent.click(screen.getByTestId('footer-menu-focus-map'));
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    expect(requestSubsetFitMock.mock.calls[0][0]).toEqual(['b1', 'c1']);
    expect(requestSubsetFitMock.mock.calls[0][1]).toMatchObject({
      mode: 'always',
      reason: 'health-filter',
    });
  });

  it('6. activeSet con reparables (D + partial) → primary Reparar N; click abre dialog (onResolveDebt llamado)', () => {
    const onResolveDebt = vi.fn();
    mount({
      ids: ['d-partial-1', 'd-partial-2', 'b1'],
      canView: true,
      canRun: true,
      onResolveDebt,
    });
    const btn = screen.getByTestId('footer-primary-resolve-debt');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/Reparar/);
    expect(btn.textContent).toMatch(/\(2\)/);
    fireEvent.click(btn);
    expect(onResolveDebt).toHaveBeenCalledTimes(1);
  });

  it('7. 0 reparables → onResolveDebt NUNCA se invoca', () => {
    const onResolveDebt = vi.fn();
    mount({ ids: ['b1', 'c1', 'a1'], canView: true, canRun: true, onResolveDebt });
    // Cualquier click razonable en footer no debe invocar onResolveDebt.
    fireEvent.click(screen.getByTestId('footer-primary-export'));
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    fireEvent.click(screen.getByTestId('footer-menu-focus-map'));
    expect(onResolveDebt).not.toHaveBeenCalled();
  });

  it('8. 0 reparables → supabase.rpc NUNCA se invoca', () => {
    mount({ ids: ['b1', 'c1', 'a1'], canView: true, canRun: true });
    fireEvent.click(screen.getByTestId('footer-primary-export'));
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    fireEvent.click(screen.getByTestId('footer-menu-focus-map'));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('9. primary NUNCA dice "Resolver deuda" cuando repairableCount = 0', () => {
    mount({ ids: ['b1', 'c1'], canView: true, canRun: true });
    // El testid legacy `footer-primary-resolve-debt` SOLO existe si hay reparables.
    expect(screen.queryByTestId('footer-primary-resolve-debt')).toBeNull();
    const allButtons = screen.getAllByRole('button');
    for (const b of allButtons) {
      expect(b.textContent ?? '').not.toMatch(/^\s*Resolver deuda\s*$/);
    }
  });

  it('10. Exportar no reparables excluye repairables (D+partial/chain)', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mount({
      ids: ['d-partial-1', 'd-chain-1', 'b1', 'c1', 'a1'],
      canView: true,
      canRun: true,
    });
    // Con reparables, la opción "Exportar no reparables" NO está visible
    // (showDebtExtras requiere repairableCount === 0).
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    expect(screen.queryByTestId('footer-menu-export-non-repairable')).toBeNull();
    dispatchSpy.mockRestore();
  });

  it('11. 0 reparables: "Exportar no reparables" emite event SIN incluir D+partial/chain', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mount({ ids: ['b1', 'b2', 'c1', 'a1'], canView: false, canRun: false });
    fireEvent.click(screen.getByTestId('footer-more-actions'));
    fireEvent.click(screen.getByTestId('footer-menu-export-non-repairable'));
    const calls = dispatchSpy.mock.calls
      .map((c) => c[0])
      .filter(
        (e): e is CustomEvent =>
          e instanceof CustomEvent && e.type === 'lovable:open-export-panel',
      );
    expect(calls.length).toBe(1);
    const ids = (calls[0].detail.locations as Array<{ id: string }>).map((l) => l.id);
    expect(ids.sort()).toEqual(['a1', 'b1', 'b2', 'c1']);
    expect(ids).not.toContain(expect.stringMatching(/^d-partial/));
    expect(ids).not.toContain(expect.stringMatching(/^d-chain/));
    dispatchSpy.mockRestore();
  });

  it('12. D repair intacto: con reparables, Geo Maintenance no aparece como primary', () => {
    mount({ ids: ['d-partial-1', 'b1'], canView: true, canRun: true });
    expect(screen.getByTestId('footer-primary-resolve-debt')).toBeInTheDocument();
    expect(screen.queryByTestId('footer-primary-geo-maintenance')).toBeNull();
    // Hint NO visible cuando hay reparables.
    expect(screen.queryByTestId('footer-debt-no-repairables-hint')).toBeNull();
  });
});
