// Master-only redirect contract for /admin/dev/poi-p2-runner.
// TEMPORARY MAINTENANCE TOOL — remove or keep hidden after P2 backlog drained.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
  },
}));

const permsMock = vi.fn();
vi.mock('@/domains/identity', () => ({
  usePermissions: () => permsMock(),
}));

import PoiP2RunnerPage from '@/pages/admin/dev/PoiP2RunnerPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/admin/dev/poi-p2-runner" element={<PoiP2RunnerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PoiP2RunnerPage gating', () => {
  it('redirects non-master to /', () => {
    permsMock.mockReturnValue({ loading: false, isMaster: () => false, hasPermission: () => true });
    renderAt('/admin/dev/poi-p2-runner');
    expect(screen.getByText('HOME')).toBeTruthy();
  });

  it('redirects when capability missing even if master', () => {
    permsMock.mockReturnValue({ loading: false, isMaster: () => true, hasPermission: () => false });
    renderAt('/admin/dev/poi-p2-runner');
    expect(screen.getByText('HOME')).toBeTruthy();
  });

  it('renders runner body for master + run_internal_tooling', () => {
    permsMock.mockReturnValue({ loading: false, isMaster: () => true, hasPermission: () => true });
    renderAt('/admin/dev/poi-p2-runner');
    expect(screen.getByText(/P2 Auto-Enrich Runner/i)).toBeTruthy();
    expect(screen.getByText(/TEMPORARY MAINTENANCE TOOL/i)).toBeTruthy();
  });
});
