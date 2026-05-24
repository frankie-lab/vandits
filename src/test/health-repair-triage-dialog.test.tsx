/**
 * HealthRepairPreviewDialog — Triage operativo por grupos.
 *
 * Plan: docs/audits/health-repair-triage-dialog-plan.md §7.
 *
 * Cobertura (13 casos):
 *   1.  Modal abierto muestra los 5 data-triage-group con counts correctos.
 *   2.  Abrir el modal NO llama supabase.rpc.
 *   3.  Click "Reparar automáticamente" llama RPC con `_location_ids ⊆ repairables`.
 *   4.  Exportar grupo B → dispatch `lovable:open-export-panel` con sólo B y scope='internal'.
 *   5.  Exportar grupo C → idem con sólo C.
 *   6.  Exportar grupo A → idem con sólo A.
 *   7.  Exportar no reparables → excluye reparables.
 *   8.  Exportar todo el scope → incluye todos.
 *   9.  Mapa grupo C → requestSubsetFit con ids de C, reason 'health-triage-open-group'.
 *  10.  Mapa per-POI → requestSubsetFit con [loc.id], reason 'health-triage-open-poi'.
 *  11.  Scope sin reparables: primary disabled con label correcto; grupos no-rep mantienen acciones.
 *  12.  Click export/map cierra el modal.
 *  13.  Contract: NO existe botón "Geo Maintenance" en grupo B.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act, within } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

// ─────────── Mocks ───────────

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: (...a: unknown[]) => toastInfo(...a),
  },
}));

const attachToJobMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: Object.assign(
    () => ({}),
    { getState: () => ({ attachToJob: attachToJobMock }) },
  ),
}));

const requestSubsetFitMock = vi.fn();
vi.mock('@/components/map/subset-fit', () => ({
  requestSubsetFit: (...a: unknown[]) => requestSubsetFitMock(...a),
}));
vi.mock('@/shared/geography/hierarchy', () => ({ getHierarchyBreadcrumb: () => '' }));

// id-prefix → rootStatus + rings.
//   a* → A, b* → B, c* → C, dp* → D+partial, dc* → D+chain,
//   dh* → D+hardError, dn* → D+sin rings.
vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root = p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  },
}));
vi.mock('@/domains/content/lib/point-health-rings', () => ({
  getPointHealthRings: (l: { id: string }) => {
    if (l.id.startsWith('dp')) return ['partial'];
    if (l.id.startsWith('dc')) return ['chain'];
    if (l.id.startsWith('dh')) return ['hardError'];
    return [];
  },
}));

import { HealthRepairPreviewDialog } from '@/components/discovery/HealthRepairPreviewDialog';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}
function scope(ids: string[]): HealthScopeResult {
  return { ids, total: ids.length, mode: 'filtered', locations: ids.map(loc) };
}

const FULL_IDS = ['a1', 'b1', 'c1', 'dp1', 'dp2', 'dh1', 'dn1'];

function exportEvents(): CustomEvent[] {
  const events: CustomEvent[] = [];
  const handler = (e: Event) => events.push(e as CustomEvent);
  window.addEventListener('lovable:open-export-panel', handler);
  return Object.assign(events, {
    dispose: () => window.removeEventListener('lovable:open-export-panel', handler),
  }) as CustomEvent[] & { dispose: () => void };
}

function getGroup(key: string): HTMLElement {
  const el = document.querySelector(`[data-triage-group="${key}"]`);
  if (!el) throw new Error(`group ${key} not found`);
  return el as HTMLElement;
}

beforeEach(() => {
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  attachToJobMock.mockReset();
  attachToJobMock.mockResolvedValue(undefined);
  requestSubsetFitMock.mockReset();
});

describe('HealthRepairPreviewDialog — triage (plan §7)', () => {
  it('1. muestra los 5 grupos con counts correctos', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    expect(getGroup('repairable').getAttribute('data-triage-group-count')).toBe('2');
    expect(getGroup('identityIncomplete').getAttribute('data-triage-group-count')).toBe('1');
    expect(getGroup('systemDebt').getAttribute('data-triage-group-count')).toBe('1');
    expect(getGroup('review').getAttribute('data-triage-group-count')).toBe('1');
    expect(getGroup('nonRepairableByType').getAttribute('data-triage-group-count')).toBe('2');
  });

  it('2. abrir el modal NO llama supabase.rpc', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('3. Reparar automáticamente envía sólo repairableIds (D ∩ partial/chain)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ job_id: 'job-1', enqueued_count: 2 }],
      error: null,
    });
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('health-repair-confirm'));
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const ids: string[] = rpcMock.mock.calls[0][1]._location_ids;
    expect(ids.sort()).toEqual(['dp1', 'dp2']);
    for (const forbid of ['a1', 'b1', 'c1', 'dh1', 'dn1']) {
      expect(ids).not.toContain(forbid);
    }
  });

  function expectExportGroup(groupKey: string, expectedId: string) {
    const events = exportEvents();
    try {
      render(
        <HealthRepairPreviewDialog
          open
          onOpenChange={vi.fn()}
          filter="debt"
          scope={scope(FULL_IDS)}
        />,
      );
      const group = getGroup(groupKey);
      const exportBtn = within(group).getByText('Exportar').closest('button')!;
      fireEvent.click(exportBtn);
      expect(events).toHaveLength(1);
      const detail = events[0].detail as { locations: GeoLocation[]; scope: string };
      expect(detail.scope).toBe('internal');
      expect(detail.locations.map((l) => l.id)).toEqual([expectedId]);
      expect(rpcMock).not.toHaveBeenCalled();
    } finally {
      (events as unknown as { dispose: () => void }).dispose();
    }
  }

  it('4. Exportar grupo B dispara open-export-panel sólo con B', () => {
    expectExportGroup('systemDebt', 'b1');
  });
  it('5. Exportar grupo C dispara open-export-panel sólo con C', () => {
    expectExportGroup('review', 'c1');
  });
  it('6. Exportar grupo A dispara open-export-panel sólo con A', () => {
    expectExportGroup('identityIncomplete', 'a1');
  });

  it('7. Exportar no reparables excluye los reparables', () => {
    const events = exportEvents();
    try {
      render(
        <HealthRepairPreviewDialog
          open
          onOpenChange={vi.fn()}
          filter="debt"
          scope={scope(FULL_IDS)}
        />,
      );
      const btn = document.querySelector(
        '[data-triage-export-target="non-repairable"]',
      ) as HTMLElement;
      expect(btn).toBeTruthy();
      fireEvent.click(btn);
      expect(events).toHaveLength(1);
      const ids = (events[0].detail as { locations: GeoLocation[] }).locations.map(
        (l) => l.id,
      );
      expect(ids.sort()).toEqual(['a1', 'b1', 'c1', 'dh1', 'dn1']);
      expect(ids).not.toContain('dp1');
      expect(ids).not.toContain('dp2');
    } finally {
      (events as unknown as { dispose: () => void }).dispose();
    }
  });

  it('8. Exportar todo el scope incluye todos los POIs', () => {
    const events = exportEvents();
    try {
      render(
        <HealthRepairPreviewDialog
          open
          onOpenChange={vi.fn()}
          filter="debt"
          scope={scope(FULL_IDS)}
        />,
      );
      const btn = document.querySelector(
        '[data-triage-export-target="all"]',
      ) as HTMLElement;
      fireEvent.click(btn);
      expect(events).toHaveLength(1);
      const ids = (events[0].detail as { locations: GeoLocation[] }).locations.map(
        (l) => l.id,
      );
      expect(ids.sort()).toEqual([...FULL_IDS].sort());
    } finally {
      (events as unknown as { dispose: () => void }).dispose();
    }
  });

  it('9. Mapa grupo C llama requestSubsetFit con ids de C y reason open-group', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    requestSubsetFitMock.mockClear(); // ignora el auto-fit on open
    const group = getGroup('review');
    const mapBtn = within(group).getByText('Mapa').closest('button')!;
    fireEvent.click(mapBtn);
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    const [ids, opts] = requestSubsetFitMock.mock.calls[0];
    expect(ids).toEqual(['c1']);
    expect(opts.reason).toBe('health-triage-open-group');
  });

  it('10. Mapa per-POI llama requestSubsetFit con [loc.id] y reason open-poi', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    requestSubsetFitMock.mockClear();
    const repairGroup = getGroup('repairable');
    const poiRow = within(repairGroup).getByText('dp1').closest('li')!;
    const mapBtn = within(poiRow as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.getAttribute('data-triage-poi-action') === 'map')!;
    fireEvent.click(mapBtn);
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    const [ids, opts] = requestSubsetFitMock.mock.calls[0];
    expect(ids).toEqual(['dp1']);
    expect(opts.reason).toBe('health-triage-open-poi');
  });

  it('11. sin reparables: primary disabled y grupos no-rep mantienen acciones', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(['a1', 'b1', 'c1', 'dh1'])}
      />,
    );
    const primary = screen.getByTestId('health-repair-confirm') as HTMLButtonElement;
    expect(primary).toBeDisabled();
    expect(primary.textContent).toMatch(/No hay POIs reparables/);

    // Cada grupo no-reparable expone export + map.
    for (const key of ['identityIncomplete', 'systemDebt', 'review', 'nonRepairableByType']) {
      const group = getGroup(key);
      const buttons = within(group).getAllByRole('button');
      const actions = buttons
        .map((b) => b.getAttribute('data-triage-group-action'))
        .filter(Boolean);
      expect(actions).toContain('export');
      expect(actions).toContain('map');
    }
  });

  it('12. Exportar grupo y Mapa grupo cierran el modal', () => {
    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const group = getGroup('systemDebt');
    fireEvent.click(within(group).getByText('Exportar').closest('button')!);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.click(within(group).getByText('Mapa').closest('button')!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('13. contract: NO existe botón "Geo Maintenance" en grupo B', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const group = getGroup('systemDebt');
    expect(within(group).queryByText(/geo maintenance/i)).toBeNull();
    expect(
      group.querySelector('[data-triage-group-action="geo-maintenance"]'),
    ).toBeNull();
  });
});
