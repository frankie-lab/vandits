/**
 * HealthRepairPreviewDialog — feedback funcional del flujo "Resolver deuda".
 *
 * Verifica los 8 invariantes del audit (PR-FILTER-ROOTSTATUS-2.x):
 *   1. spinner + label "Encolando…" + disabled mientras submitting.
 *   2. doble click NO encola dos veces.
 *   3. RPC se llama con _location_ids = repairableIds (D ∩ {partial,chain}).
 *   4. éxito → attachToJob(job_id) + toast.success + modal cierra.
 *   5. enqueued_count=0 → exhausted, modal abierto, no attachToJob.
 *   6. error RPC → toast.error + modal abierto + actionable (no submitting).
 *   7. sin reparables → confirm disabled, no RPC.
 *   8. aria-busy + aria-live reflejan submitting/exhausted.
 *
 * No ejecuta RPC real. Mockea supabase, store y sonner.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react';
import type { GeoLocation, HealthFilter } from '@/types/location';

// ───────────────────────── Mocks ─────────────────────────

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
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
    {
      getState: () => ({ attachToJob: attachToJobMock }),
    },
  ),
}));

vi.mock('@/components/map/subset-fit', () => ({
  requestSubsetFit: vi.fn(),
}));

vi.mock('@/shared/geography/hierarchy', () => ({
  getHierarchyBreadcrumb: () => '',
}));
vi.mock('@/domains/identity/hooks/use-permissions', () => ({
  useCapability: () => ({ allowed: false, loading: false }),
}));

// Classifier: id-prefix → rootStatus. d* → D, a* → A, b* → B, c* → C.
vi.mock('@/domains/content/lib/poi-identity-root-status-client', () => ({
  classifyPoiRootStatusForLocation: (l: { id: string }) => {
    const p = l.id[0];
    const root =
      p === 'a' ? 'A' : p === 'b' ? 'B' : p === 'c' ? 'C' : 'D';
    return { rootStatus: root, eligibleForAutoEnrich: root === 'D', reason: 'test' };
  },
}));

import { HealthRepairPreviewDialog } from '@/components/discovery/HealthRepairPreviewDialog';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}

function makeScope(ids: string[]): HealthScopeResult {
  const locations = ids.map(loc);
  return { ids, total: ids.length, mode: 'filtered', locations };
}

function renderDialog(
  scopeIds: string[],
  filter: HealthFilter = 'partial',
) {
  return render(
    <HealthRepairPreviewDialog
      open
      onOpenChange={vi.fn()}
      filter={filter}
      scope={makeScope(scopeIds)}
    />,
  );
}

function getConfirm() {
  return screen.getByTestId('health-repair-confirm') as HTMLButtonElement;
}

beforeEach(() => {
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  attachToJobMock.mockReset();
  attachToJobMock.mockResolvedValue(undefined);
});

// ───────────────────── Tests ─────────────────────

describe('HealthRepairPreviewDialog — feedback funcional', () => {
  it('1. spinner + label "Encolando…" + disabled mientras submitting', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    rpcMock.mockReturnValue(
      new Promise((res) => {
        resolveRpc = res;
      }),
    );

    renderDialog(['d1', 'd2']);
    const btn = getConfirm();
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
      expect(btn.textContent).toContain('Encolando');
    });

    const dialog = screen.getByTestId('health-repair-preview-dialog');
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(dialog.getAttribute('data-submitting')).toBe('true');
    expect(screen.getByTestId('health-repair-status').textContent).toMatch(/Encolando/);

    await act(async () => {
      resolveRpc({ data: [{ job_id: 'job-1', enqueued_count: 2 }], error: null });
    });
  });

  it('2. doble click NO llama dos veces a la RPC', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    rpcMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveRpc = res;
        }),
    );

    renderDialog(['d1']);
    const btn = getConfirm();
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    expect(rpcMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRpc({ data: [{ job_id: 'job-1', enqueued_count: 1 }], error: null });
    });
  });

  it('3. RPC recibe sólo repairableIds (D ∩ {partial,chain}) — A/B/C excluidos', async () => {
    rpcMock.mockResolvedValue({
      data: [{ job_id: 'job-1', enqueued_count: 2 }],
      error: null,
    });

    renderDialog(['d1', 'd2', 'a1', 'b1', 'c1']);

    await act(async () => {
      fireEvent.click(getConfirm());
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe('enqueue_health_repair');
    expect(args._action).toBe('partial');
    expect(args._scope_mode).toBe('filtered');
    expect(args._location_ids).toEqual(['d1', 'd2']);
    expect(args._location_ids).not.toContain('a1');
    expect(args._location_ids).not.toContain('b1');
    expect(args._location_ids).not.toContain('c1');
  });

  it('3b. filter=hardError → no hay repairables, confirm disabled, no RPC', () => {
    renderDialog(['d1', 'd2'], 'hardError');
    const btn = getConfirm();
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('4. éxito → attachToJob(job_id) + toast.success + onOpenChange(false)', async () => {
    rpcMock.mockResolvedValue({
      data: [{ job_id: 'job-xyz', enqueued_count: 2 }],
      error: null,
    });
    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="partial"
        scope={makeScope(['d1', 'd2'])}
      />,
    );

    await act(async () => {
      fireEvent.click(getConfirm());
    });

    expect(attachToJobMock).toHaveBeenCalledWith('job-xyz');
    expect(attachToJobMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('5. enqueued_count=0 → exhausted, no attachToJob, modal abierto, label cambia', async () => {
    rpcMock.mockResolvedValue({
      data: [{ job_id: null, enqueued_count: 0 }],
      error: null,
    });
    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="partial"
        scope={makeScope(['d1'])}
      />,
    );

    await act(async () => {
      fireEvent.click(getConfirm());
    });

    expect(attachToJobMock).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    const btn = getConfirm();
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('Sin acciones disponibles');

    const dialog = screen.getByTestId('health-repair-preview-dialog');
    expect(dialog.getAttribute('data-exhausted')).toBe('true');
    expect(screen.getByTestId('health-repair-status').textContent).toMatch(
      /Sin acciones disponibles/,
    );
  });

  it('6. error RPC → toast.error, submitting=false, modal sigue actionable', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="partial"
        scope={makeScope(['d1'])}
      />,
    );

    await act(async () => {
      fireEvent.click(getConfirm());
    });

    expect(toastError).toHaveBeenCalled();
    expect(attachToJobMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    const btn = getConfirm();
    // Tras el error, submitting → false, btn vuelve a estar habilitado para reintento.
    expect(btn).not.toBeDisabled();
    const dialog = screen.getByTestId('health-repair-preview-dialog');
    expect(dialog.getAttribute('aria-busy')).toBe('false');
  });

  it('7. sin reparables (sólo A/B/C) → confirm disabled, no RPC', () => {
    renderDialog(['a1', 'b1', 'c1']);
    const btn = getConfirm();
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('No hay POIs reparables');
    fireEvent.click(btn);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
