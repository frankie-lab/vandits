/**
 * Wiring "Resolver deuda" — modo agregado `'debt'` del modal.
 *
 * Cierra la regresión donde `onResolveDebt` quedaba como noop por depender
 * de `openHealthRepairRef.current()` registrado por `HealthFilterActionCTA`
 * (que retorna null si `!filters.healthFilter`).
 *
 * Cubre:
 *  - footer mode='debt' → click primary llama onResolveDebt.
 *  - mini-harness con useState (mismo patrón que FilterBar) → click abre dialog.
 *  - abrir dialog NO llama supabase.rpc.
 *  - dialog filter='debt' sin reparables: abre, muestra desglose, confirm
 *    disabled, click confirm no llama RPC.
 *  - dialog filter='debt' con reparables mixtos: dispara RPC partial/chain
 *    con IDs correctos, attachToJob con primer job_id, A/B/C/review/hardError
 *    nunca en _location_ids.
 *  - dialog filter='debt' error en primera RPC: modal abierto, segunda RPC
 *    NO disparada, attachToJob NO llamado.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act, waitFor } from '@testing-library/react';
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

vi.mock('@/components/map/subset-fit', () => ({ requestSubsetFit: vi.fn() }));
vi.mock('@/shared/geography/hierarchy', () => ({ getHierarchyBreadcrumb: () => '' }));

// id-prefix → rootStatus + rings.
//   a* → A, b* → B, c* → C, dp* → D+partial, dc* → D+chain,
//   db* → D+both, dr* → D+review, dh* → D+hardError, dn* → D+sin rings.
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
    if (l.id.startsWith('db')) return ['partial', 'chain'];
    if (l.id.startsWith('dr')) return ['review'];
    if (l.id.startsWith('dh')) return ['hardError'];
    return [];
  },
}));

import { HealthRepairPreviewDialog } from '@/components/discovery/HealthRepairPreviewDialog';
import { EffectiveActionFooter } from '@/components/filters/EffectiveActionFooter';
import type { HealthScopeResult } from '@/domains/discovery/lib/health-filter-scope';

function loc(id: string): GeoLocation {
  return { id, name: id, latitude: 0, longitude: 0 } as unknown as GeoLocation;
}
function scope(ids: string[]): HealthScopeResult {
  return { ids, total: ids.length, mode: 'filtered', locations: ids.map(loc) };
}
function confirm() {
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

// ─────────── Tests ───────────

describe('EffectiveActionFooter — mode="debt"', () => {
  it('click en primary llama onResolveDebt', () => {
    const onResolveDebt = vi.fn();
    render(
      <EffectiveActionFooter
        mode="debt"
        locations={[loc('dp1'), loc('dp2')] as any}
        hasUserSelection={false}
        scopeLabel="Test scope"
        onClearSelection={vi.fn()}
        onResolveDebt={onResolveDebt}
        onSelectAll={vi.fn()}
      />,
    );
    // Footer primary debt: botón "Resolver deuda".
    const btn = screen.getByRole('button', { name: /resolver deuda/i });
    fireEvent.click(btn);
    expect(onResolveDebt).toHaveBeenCalledTimes(1);
  });
});

describe('Wiring footer → dialog (mini harness, mismo patrón que FilterBar)', () => {
  function Harness({ ids }: { ids: string[] }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <EffectiveActionFooter
          mode="debt"
          locations={ids.map(loc) as any}
          hasUserSelection={false}
          scopeLabel="Test scope"
          onClearSelection={vi.fn()}
          onResolveDebt={() => setOpen(true)}
          onSelectAll={vi.fn()}
        />
        <HealthRepairPreviewDialog
          open={open}
          onOpenChange={setOpen}
          filter="debt"
          scope={scope(ids)}
        />
      </>
    );
  }

  it('click "Resolver deuda" abre HealthRepairPreviewDialog y NO llama RPC', () => {
    render(<Harness ids={['dp1', 'dc1', 'a1']} />);
    expect(screen.queryByTestId('health-repair-preview-dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /resolver deuda/i }));

    const dialog = screen.getByTestId('health-repair-preview-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('data-filter-mode')).toBe('debt');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('HealthRepairPreviewDialog — filter="debt"', () => {
  it('sin reparables (sólo A/B/C/D-review/D-hardError/D-sin-rings): abre, confirm disabled, click no llama RPC', () => {
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={vi.fn()}
        filter="debt"
        scope={scope(['a1', 'b1', 'c1', 'dr1', 'dh1', 'dn1'])}
      />,
    );
    const dialog = screen.getByTestId('health-repair-preview-dialog');
    expect(dialog.getAttribute('data-repairable-count')).toBe('0');
    expect(dialog.getAttribute('data-total')).toBe('6');

    const btn = confirm();
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('No hay POIs reparables');
    fireEvent.click(btn);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('con reparables mixtos: dispara RPC partial/chain con IDs correctos, attachToJob, exclusión A/B/C/review/hardError', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ job_id: 'job-A', enqueued_count: 2 }], error: null })
      .mockResolvedValueOnce({ data: [{ job_id: 'job-B', enqueued_count: 1 }], error: null });

    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="debt"
        scope={scope([
          'dp1', 'dp2',          // partial → repairablePartialIds
          'dc1',                 // chain   → repairableChainIds
          'db1',                 // both    → partial gana
          'dr1', 'dh1', 'dn1',   // no reparables (D pero sin partial/chain efectivo)
          'a1', 'b1', 'c1',      // nunca reparables
        ])}
      />,
    );
    const dialog = screen.getByTestId('health-repair-preview-dialog');
    // partial: dp1, dp2, db1 — chain: dc1
    expect(dialog.getAttribute('data-repairable-partial-count')).toBe('3');
    expect(dialog.getAttribute('data-repairable-chain-count')).toBe('1');
    expect(dialog.getAttribute('data-repairable-count')).toBe('4');

    await act(async () => {
      fireEvent.click(confirm());
    });

    expect(rpcMock).toHaveBeenCalledTimes(2);

    const partialCall = rpcMock.mock.calls.find((c) => c[1]._action === 'partial');
    const chainCall   = rpcMock.mock.calls.find((c) => c[1]._action === 'chain');
    expect(partialCall).toBeTruthy();
    expect(chainCall).toBeTruthy();

    const partialIds: string[] = partialCall![1]._location_ids;
    const chainIds: string[] = chainCall![1]._location_ids;
    expect(partialIds.sort()).toEqual(['db1', 'dp1', 'dp2']);
    expect(chainIds).toEqual(['dc1']);

    // Exclusiones DURAS: A/B/C/review/hardError/sin-rings NUNCA en _location_ids.
    const forbidden = ['a1', 'b1', 'c1', 'dr1', 'dh1', 'dn1'];
    for (const id of forbidden) {
      expect(partialIds).not.toContain(id);
      expect(chainIds).not.toContain(id);
    }

    expect(attachToJobMock).toHaveBeenCalledTimes(1);
    expect(attachToJobMock).toHaveBeenCalledWith('job-A');
    expect(toastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('error en primera RPC: corta, segunda RPC NO disparada, attachToJob NO llamado, modal abierto', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      .mockResolvedValueOnce({ data: [{ job_id: 'should-not', enqueued_count: 99 }], error: null });

    const onOpenChange = vi.fn();
    render(
      <HealthRepairPreviewDialog
        open
        onOpenChange={onOpenChange}
        filter="debt"
        scope={scope(['dp1', 'dc1'])}
      />,
    );

    await act(async () => {
      fireEvent.click(confirm());
    });

    // Si partial sale primero y falla, chain no se llama.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(attachToJobMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    const btn = confirm();
    expect(btn).not.toBeDisabled();
  });
});
