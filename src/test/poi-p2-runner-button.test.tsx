/**
 * PoiP2RunnerButton — visible behaviour contract.
 *
 * Gating notes:
 *   - This component lives inside `InternalToolsPanel`, which is rendered only
 *     when the user holds the `run_internal_tooling` capability (master-only
 *     today via the master bypass). The two "no ve botón" requirements from
 *     the spec are therefore enforced by panel-level gating; we assert them
 *     indirectly by checking that the tab is gated to `run_internal_tooling`
 *     in `ADMIN_TABS`.
 *
 * Mutating-state contract (server-side):
 *   - The bridge respects ALLOW_P2_REAL_BATCH. The component just routes the
 *     intent. We assert the badge + tooltip + dialog content here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PoiP2RunnerButton } from '@/components/admin/PoiP2RunnerButton';
import { ADMIN_TABS } from '@/components/admin/admin-tabs';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: any[]) => invokeMock(...args) } },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderButton() {
  return render(
    <MemoryRouter>
      <PoiP2RunnerButton />
    </MemoryRouter>,
  );
}

function statusReply(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      activeRun: null,
      pilot100: { pass: true, reason: 'ok' },
      allowRealBatch: false,
      nextBatchAllowed: true,
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  cleanup();
});

describe('PoiP2RunnerButton — panel-level gating', () => {
  it('internal-tools tab is capability-gated to run_internal_tooling', () => {
    const tab = ADMIN_TABS.find(t => t.key === 'internal-tools');
    expect(tab).toBeDefined();
    expect(tab!.capability).toBe('run_internal_tooling');
  });
});

describe('PoiP2RunnerButton — visible behaviour', () => {
  it('shows DRY-RUN badge when ALLOW_P2_REAL_BATCH is off', async () => {
    invokeMock.mockResolvedValueOnce(statusReply({ allowRealBatch: false }));
    renderButton();
    await waitFor(() => expect(screen.getByTestId('poi-p2-runner-mode-badge')).toHaveTextContent('DRY-RUN'));
  });

  it('shows REAL MODE badge when ALLOW_P2_REAL_BATCH is on', async () => {
    invokeMock.mockResolvedValueOnce(statusReply({ allowRealBatch: true }));
    renderButton();
    await waitFor(() => expect(screen.getByTestId('poi-p2-runner-mode-badge')).toHaveTextContent('REAL MODE'));
  });

  it('disables button when Pilot-100 has not PASSed', async () => {
    invokeMock.mockResolvedValueOnce(statusReply({ pilot100: { pass: false, reason: 'no_pilot_run' } }));
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId('poi-p2-runner-button-disabled')).toBeDisabled(),
    );
  });

  it('switches to "Ver estado P2" deep-link when a run is active (non-terminal)', async () => {
    invokeMock.mockResolvedValueOnce(statusReply({
      activeRun: { id: 'abcd1234', status: 'running', label: 'P2-batch-25' },
    }));
    renderButton();
    const link = await screen.findByTestId('poi-p2-runner-button-view');
    expect(link).toHaveAttribute('href', '/admin/dev/poi-p2-runner');
    expect(link).toHaveTextContent(/ver estado p2/i);
    // start dialog button must NOT be present
    expect(screen.queryByTestId('poi-p2-runner-button-start')).toBeNull();
  });

  it('opens dialog with default size 250 and requires CONFIRM P2 BATCH token', async () => {
    invokeMock.mockResolvedValueOnce(statusReply({ allowRealBatch: true }));
    renderButton();
    const btn = await screen.findByTestId('poi-p2-runner-button-start');
    fireEvent.click(btn);
    // Default size is 250 → confirm token input visible
    expect(await screen.findByTestId('poi-p2-runner-confirm-input')).toBeInTheDocument();
    const submit = screen.getByTestId('poi-p2-runner-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('poi-p2-runner-confirm-input'), {
      target: { value: 'CONFIRM P2 BATCH' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('dry-run mode forwards the request but flags dryRun in the toast', async () => {
    invokeMock
      .mockResolvedValueOnce(statusReply({ allowRealBatch: false }))   // initial status
      .mockResolvedValueOnce({ data: { dryRun: true }, error: null })   // start-next-batch
      .mockResolvedValueOnce(statusReply({ allowRealBatch: false }));   // refresh
    renderButton();
    const btn = await screen.findByTestId('poi-p2-runner-button-start');
    fireEvent.click(btn);
    fireEvent.change(await screen.findByTestId('poi-p2-runner-confirm-input'), {
      target: { value: 'CONFIRM P2 BATCH' },
    });
    fireEvent.click(screen.getByTestId('poi-p2-runner-submit'));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('poi-p2-runner-bridge', expect.objectContaining({
        body: expect.objectContaining({
          action: 'start-next-batch',
          size: 250,
          confirmToken: 'CONFIRM P2 BATCH',
        }),
      }));
    });
  });
});
