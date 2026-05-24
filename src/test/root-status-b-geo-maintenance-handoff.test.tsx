/**
 * PR-ROOT-STATUS-B · Geo Maintenance scoped handoff.
 *
 * Plan: docs/audits/root-status-b-geo-maintenance-scoped-plan.md
 *
 * Cobertura:
 *   T1.  sin capability → botón NO aparece en grupo B.
 *   T2.  con capability → botón aparece en grupo B.
 *   T3.  click despacha exactamente un evento con IDs de B y `source='health-repair-triage'`.
 *   T4.  click NO llama supabase.rpc (no escritura desde triage).
 *   T5.  payload contiene SOLO IDs B (excluye A/C/D/no-reparables).
 *   T6.  click cierra el modal.
 *   T7.  scope sin Bs → botón NO aparece (locationIds vacío).
 *   T8.  regresión: confirm primario sigue usando enqueue_health_repair y NUNCA recibe IDs B.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import type { GeoLocation } from '@/types/location';

// ─────────── Mocks ───────────
const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: Object.assign(
    () => ({}),
    { getState: () => ({ attachToJob: vi.fn().mockResolvedValue(undefined) }) },
  ),
}));
vi.mock('@/components/map/subset-fit', () => ({ requestSubsetFit: vi.fn() }));
vi.mock('@/shared/geography/hierarchy', () => ({ getHierarchyBreadcrumb: () => '' }));
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

// useCapability mock — toggleable por test.
let capabilityAllowed = true;
vi.mock('@/domains/identity/hooks/use-permissions', () => ({
  useCapability: () => ({ allowed: capabilityAllowed, loading: false }),
}));

import { HealthRepairPreviewDialog } from '@/components/discovery/HealthRepairPreviewDialog';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';
import {
  GEO_MAINTENANCE_HANDOFF_EVENT,
  __resetGeoMaintenanceHandoffForTests,
  peekPendingGeoMaintenanceHandoff,
} from '@/shared/events/geo-maintenance-handoff';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}
function scope(ids: string[]): HealthScopeResult {
  return { ids, total: ids.length, mode: 'filtered', locations: ids.map(loc) };
}
function getGroup(key: string): HTMLElement {
  const el = document.querySelector(`[data-triage-group="${key}"]`);
  if (!el) throw new Error(`group ${key} not found`);
  return el as HTMLElement;
}
function captureHandoffEvents(): CustomEvent[] {
  const out: CustomEvent[] = [];
  window.addEventListener(GEO_MAINTENANCE_HANDOFF_EVENT, (e) =>
    out.push(e as CustomEvent),
  );
  return out;
}

const FULL_IDS = ['a1', 'b1', 'b2', 'b3', 'c1', 'dp1', 'dh1', 'dn1'];
const B_IDS = ['b1', 'b2', 'b3'];

beforeEach(() => {
  rpcMock.mockReset();
  capabilityAllowed = true;
  __resetGeoMaintenanceHandoffForTests();
  // No es posible quitar listeners de eventos sin referencias, así que cada
  // test usa su propio captureHandoffEvents() y comprueba longitudes mínimas.
});

describe('Root Status B → Geo Maintenance handoff', () => {
  it('T1. sin capability: botón NO aparece en grupo B', () => {
    capabilityAllowed = false;
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const group = getGroup('systemDebt');
    expect(
      group.querySelector('[data-triage-group-action="geo-maintenance"]'),
    ).toBeNull();
  });

  it('T2. con capability: botón aparece en grupo B', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const group = getGroup('systemDebt');
    expect(
      group.querySelector('[data-triage-group-action="geo-maintenance"]'),
    ).not.toBeNull();
  });

  it('T3. click despacha evento con IDs de B exactos y source correcto', () => {
    const events = captureHandoffEvents();
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
    const btn = group.querySelector(
      '[data-triage-group-action="geo-maintenance"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const detail = events[events.length - 1].detail as {
      locationIds: string[];
      source: string;
      label: string;
    };
    expect(detail.source).toBe('health-repair-triage');
    expect([...detail.locationIds].sort()).toEqual([...B_IDS].sort());
    expect(detail.label).toMatch(/Grupo B|Deuda de sistema/i);
    // Persistido como pending para mount tardío del panel.
    const pending = peekPendingGeoMaintenanceHandoff();
    expect(pending?.locationIds.sort()).toEqual([...B_IDS].sort());
  });

  it('T4. click NO llama supabase.rpc (no escritura desde triage)', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const group = getGroup('systemDebt');
    fireEvent.click(
      group.querySelector('[data-triage-group-action="geo-maintenance"]')!,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('T5. payload excluye A/C/D/no-reparables', () => {
    const events = captureHandoffEvents();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    fireEvent.click(
      getGroup('systemDebt').querySelector(
        '[data-triage-group-action="geo-maintenance"]',
      )!,
    );
    const detail = events[events.length - 1].detail as { locationIds: string[] };
    const NON_B = ['a1', 'c1', 'dp1', 'dh1', 'dn1'];
    for (const id of NON_B) expect(detail.locationIds).not.toContain(id);
  });

  it('T6. click cierra el modal', () => {
    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    fireEvent.click(
      getGroup('systemDebt').querySelector(
        '[data-triage-group-action="geo-maintenance"]',
      )!,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('T7. scope sin B: botón NO aparece (grupo systemDebt no se renderiza)', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(['a1', 'c1', 'dp1'])}
      />,
    );
    expect(
      document.querySelector('[data-triage-group="systemDebt"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-triage-group-action="geo-maintenance"]'),
    ).toBeNull();
  });

  it('T8. regresión: confirm primario llama enqueue_health_repair SIN IDs B', async () => {
    rpcMock.mockResolvedValue({ data: [{ job_id: 'j1', enqueued_count: 2 }], error: null });
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(FULL_IDS)}
      />,
    );
    const confirmBtn = document.querySelector(
      '[data-testid="health-repair-confirm"]',
    ) as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    await Promise.resolve();
    await Promise.resolve();
    // Toda llamada a enqueue_health_repair tiene que excluir IDs B.
    for (const call of rpcMock.mock.calls) {
      expect(call[0]).toBe('enqueue_health_repair');
      const ids = (call[1] as { _location_ids: string[] })._location_ids;
      for (const b of B_IDS) expect(ids).not.toContain(b);
    }
  });
});
