/**
 * DebtResolutionPanel — Fase 1.
 *
 * Plan: docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md
 *
 * Garantías DURAS cubiertas:
 *  - Render directo del subpanel (sin pasar por FilterBar): comportamiento
 *    canónico del componente, agnóstico al wrapper.
 *  - Abrir el subpanel NO llama supabase.rpc ni supabase.functions.invoke.
 *  - Abrir el subpanel NO llama requestSubsetFit automáticamente.
 *  - Grupos y counts correctos (A/B/C/D mezclados).
 *  - Exportar grupo envía SÓLO ese grupo.
 *  - Mapa grupo → requestSubsetFit con los IDs del grupo.
 *  - Mapa POI → requestSubsetFit con [id].
 *  - Popup POI → setFocusedLocation(id).
 *  - Sin capability: no aparece "Geo Maintenance" en grupo B.
 *  - Con capability: aparece sólo en B y despacha handoff sin escribir.
 *  - Reparar grupo: invoca callback `onOpenRepairConfirm` (apertura del modal).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

// ───────────────────────── Mocks ─────────────────────────

const rpcMock = vi.fn();
const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

const requestSubsetFitMock = vi.fn();
vi.mock('@/components/map/subset-fit', () => ({
  requestSubsetFit: (...args: unknown[]) => requestSubsetFitMock(...args),
}));

vi.mock('@/shared/geography/hierarchy', () => ({
  getHierarchyBreadcrumb: () => '',
}));

// useCapability: controlado por flag exportada.
const capabilityFlags = { allowed: false };
vi.mock('@/domains/identity/hooks/use-permissions', () => ({
  useCapability: () => ({
    allowed: capabilityFlags.allowed,
    loading: false,
  }),
}));

const handoffMock = vi.fn();
const navMock = vi.fn();
vi.mock('@/shared/events/geo-maintenance-handoff', () => ({
  dispatchGeoMaintenanceHandoff: (...a: unknown[]) => handoffMock(...a),
  navigateToGeoMaintenance: (...a: unknown[]) => navMock(...a),
}));

const setFocusedLocationMock = vi.fn();
vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ setFocusedLocation: setFocusedLocationMock }),
    },
  ),
}));

// Classifier por prefijo (d* → D, a* → A, b* → B, c* → C).
vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root =
      p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  },
}));

// Rings: d-partial-* → ['partial'], d-chain-* → ['chain'], d-* → [].
vi.mock('@/domains/content/lib/point-health-rings', () => ({
  getPointHealthRings: (l: { id: string }) => {
    if (l.id.startsWith('d-partial')) return ['partial'];
    if (l.id.startsWith('d-chain')) return ['chain'];
    return [];
  },
}));

import { DebtResolutionPanel } from '@/components/discovery/DebtResolutionPanel';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

function makeScope(ids: string[]): HealthScopeResult {
  const locations = ids.map(loc);
  return { ids, total: ids.length, mode: 'filtered', locations };
}

// Fixture: 2 reparables (D+partial, D+chain), 1 D no-reparable, 1 A, 2 B, 1 C.
const FIXTURE_IDS = [
  'd-partial-1',
  'd-chain-1',
  'd-non-1',
  'a-1',
  'b-1',
  'b-2',
  'c-1',
];

beforeEach(() => {
  rpcMock.mockReset();
  invokeMock.mockReset();
  requestSubsetFitMock.mockReset();
  handoffMock.mockReset();
  navMock.mockReset();
  setFocusedLocationMock.mockReset();
  capabilityFlags.allowed = false;
});

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof DebtResolutionPanel>> = {},
) {
  const onBack = vi.fn();
  const onOpenRepairConfirm = vi.fn();
  const utils = render(
    <DebtResolutionPanel
      scope={makeScope(FIXTURE_IDS)}
      onBack={onBack}
      onOpenRepairConfirm={onOpenRepairConfirm}
      {...overrides}
    />,
  );
  return { ...utils, onBack, onOpenRepairConfirm };
}

describe('DebtResolutionPanel — Phase 1', () => {
  it('abrir el subpanel NO llama supabase.rpc ni supabase.functions.invoke', () => {
    renderPanel();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('abrir el subpanel NO llama requestSubsetFit automáticamente', () => {
    renderPanel();
    expect(requestSubsetFitMock).not.toHaveBeenCalled();
  });

  it('renderiza grupos con counts correctos', () => {
    const { container } = renderPanel();
    const panel = container.querySelector(
      '[data-testid="debt-resolution-panel"]',
    )!;
    expect(panel.getAttribute('data-debt-total')).toBe('7');
    expect(panel.getAttribute('data-debt-repairable-count')).toBe('2');
    expect(panel.getAttribute('data-debt-a-count')).toBe('1');
    expect(panel.getAttribute('data-debt-b-count')).toBe('2');
    expect(panel.getAttribute('data-debt-c-count')).toBe('1');
    expect(panel.getAttribute('data-debt-non-repairable-count')).toBe('1');

    expect(
      container.querySelector('[data-debt-group="repairable"]')?.getAttribute(
        'data-debt-group-count',
      ),
    ).toBe('2');
    expect(
      container.querySelector('[data-debt-group="systemDebt"]')?.getAttribute(
        'data-debt-group-count',
      ),
    ).toBe('2');
    expect(
      container.querySelector('[data-debt-group="review"]')?.getAttribute(
        'data-debt-group-count',
      ),
    ).toBe('1');
    expect(
      container.querySelector(
        '[data-debt-group="identityIncomplete"]',
      )?.getAttribute('data-debt-group-count'),
    ).toBe('1');
    expect(
      container.querySelector(
        '[data-debt-group="nonRepairableByType"]',
      )?.getAttribute('data-debt-group-count'),
    ).toBe('1');
  });

  it('exportar grupo B envía SÓLO los IDs de B', () => {
    const events: Array<{ ids: string[]; label: string; scope: string }> = [];
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        locations: GeoLocation[];
        label: string;
        scope: string;
      };
      events.push({
        ids: d.locations.map((l) => l.id),
        label: d.label,
        scope: d.scope,
      });
    };
    window.addEventListener('lovable:open-export-panel', handler);
    const { container } = renderPanel();
    const groupB = container.querySelector(
      '[data-debt-group="systemDebt"]',
    ) as HTMLElement;
    const btn = within(groupB).getByTestId
      ? null
      : (groupB.querySelector(
          '[data-debt-group-action="export"]',
        ) as HTMLButtonElement);
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    window.removeEventListener('lovable:open-export-panel', handler);
    expect(events).toHaveLength(1);
    expect(events[0].ids.sort()).toEqual(['b-1', 'b-2']);
    expect(events[0].scope).toBe('internal');
  });

  it('mapa grupo llama requestSubsetFit con SÓLO los IDs del grupo', () => {
    const { container } = renderPanel();
    const groupB = container.querySelector(
      '[data-debt-group="systemDebt"]',
    ) as HTMLElement;
    const btn = groupB.querySelector(
      '[data-debt-group-action="map"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    const [ids, opts] = requestSubsetFitMock.mock.calls[0];
    expect((ids as string[]).slice().sort()).toEqual(['b-1', 'b-2']);
    expect((opts as { reason: string }).reason).toBe(
      'debt-sidepanel-group-fit',
    );
  });

  it('mapa POI llama requestSubsetFit con [id] único', () => {
    const { container } = renderPanel();
    const row = container.querySelector(
      '[data-debt-poi-id="b-1"]',
    ) as HTMLElement;
    const btn = row.querySelector(
      '[data-debt-row-action="map"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(requestSubsetFitMock).toHaveBeenCalledTimes(1);
    const [ids, opts] = requestSubsetFitMock.mock.calls[0];
    expect(ids).toEqual(['b-1']);
    expect((opts as { reason: string }).reason).toBe(
      'debt-sidepanel-row-focus',
    );
  });

  it('popup POI llama setFocusedLocation(id)', () => {
    const { container } = renderPanel();
    const row = container.querySelector(
      '[data-debt-poi-id="c-1"]',
    ) as HTMLElement;
    const btn = row.querySelector(
      '[data-debt-row-action="popup"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(setFocusedLocationMock).toHaveBeenCalledTimes(1);
    expect(setFocusedLocationMock).toHaveBeenCalledWith('c-1');
  });

  it('SIN capability: no aparece Geo Maintenance en B', () => {
    capabilityFlags.allowed = false;
    const { container } = renderPanel();
    expect(
      container.querySelector('[data-debt-group-action="geo-maintenance"]'),
    ).toBeNull();
  });

  it('CON capability: aparece SÓLO en B y despacha handoff sin escribir', () => {
    capabilityFlags.allowed = true;
    const { container } = renderPanel();
    const btns = container.querySelectorAll(
      '[data-debt-group-action="geo-maintenance"]',
    );
    expect(btns.length).toBe(1);
    const parentGroup = btns[0].closest('[data-debt-group]') as HTMLElement;
    expect(parentGroup.getAttribute('data-debt-group')).toBe('systemDebt');

    fireEvent.click(btns[0] as HTMLButtonElement);
    expect(handoffMock).toHaveBeenCalledTimes(1);
    const payload = handoffMock.mock.calls[0][0] as {
      locationIds: string[];
      source: string;
    };
    expect(payload.locationIds.slice().sort()).toEqual(['b-1', 'b-2']);
    expect(navMock).toHaveBeenCalledTimes(1);

    // CRÍTICO: no se escribió nada al hacer handoff.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Reparar grupo invoca onOpenRepairConfirm (sin escribir)', () => {
    const { container, onOpenRepairConfirm } = renderPanel();
    const btn = container.querySelector(
      '[data-debt-group="repairable"] [data-debt-group-action="repair-confirm"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(onOpenRepairConfirm).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('Volver invoca onBack', () => {
    const { onBack } = renderPanel();
    fireEvent.click(screen.getByTestId('debt-resolution-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
