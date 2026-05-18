/**
 * P-POI-CURATION-2.2 — POI-1b: un único owner de scroll = el popup.
 *
 * Reglas verificadas:
 *  - En `variant="inline"`, ni el root ni el contenedor de resultados pueden
 *    imponer scroll vertical propio (`overflow-y-auto`) ni `maxHeight`.
 *  - El hook `data-nearby-scroll-owner="popup"` queda en el root inline.
 *  - El contenedor de resultados expone `data-nearby-overflow="none"` en inline.
 *  - La rama `card` mantiene su scroll propio (`overflow-y-auto`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';

// ── Mocks mínimos ────────────────────────────────────────────────────
// Radix Slider depende de ResizeObserver, ausente en jsdom.
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@/domains/identity/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnThis(),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { points: [] }, error: null }) },
  },
}));

vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    (selector?: any) => {
      const state = {
        documents: [],
        updateLocation: vi.fn(),
        setFocusedLocation: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ updateLocation: vi.fn(), setFocusedLocation: vi.fn() }) },
  ),
}));

vi.mock('@/domains/content/lib/wiki-name-search', () => ({
  searchWikiCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/domains/content/lib/enrich-location', () => ({
  triggerEnrichLocation: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ── Import after mocks ───────────────────────────────────────────────
import { NearbyPanel } from '@/domains/content/components/PointContextActions';

const baseLocation = {
  id: 'loc-1b',
  name: 'POI 1b',
  latitude: 41.0,
  longitude: 2.0,
  description: null,
  is_approved: true,
  place_type: null,
  enriched_data: null,
} as any;

beforeEach(() => cleanup());

describe('P-POI-CURATION-2.2 — un solo scroll por popup', () => {
  it('inline: root SIN overflow-y/maxHeight y resultados SIN scroll propio', () => {
    const { container } = render(
      <NearbyPanel
        location={baseLocation}
        docId={null}
        userId="user-1"
        variant="inline"
        onClose={() => {}}
        onLocationUpdated={() => {}}
        onLocationMerged={() => {}}
      />,
    );

    const root = container.querySelector('[data-nearby-scroll-owner="popup"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    // Root no debe imponer maxHeight inline ni overflow vertical.
    expect(root!.style.maxHeight).toBe('');
    expect(root!.className).not.toMatch(/overflow-y-auto/);
    expect(root!.className).not.toMatch(/overflow-hidden\b/);

    const results = container.querySelector('[data-nearby-results]') as HTMLElement | null;
    expect(results).not.toBeNull();
    expect(results!.getAttribute('data-nearby-overflow')).toBe('none');
    expect(results!.className).not.toMatch(/overflow-y-auto/);
    expect(results!.className).not.toMatch(/min-h-0/);
    expect(results!.className).not.toMatch(/flex-1/);
  });

  it('sidebar: mantiene scroll interno propio (fuera de alcance del cambio)', () => {
    const { container } = render(
      <NearbyPanel
        location={baseLocation}
        docId={null}
        userId="user-1"
        variant="sidebar"
        onClose={() => {}}
        onLocationUpdated={() => {}}
        onLocationMerged={() => {}}
      />,
    );
    const root = container.querySelector('[data-nearby-scroll-owner="self"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    const results = container.querySelector('[data-nearby-results]') as HTMLElement | null;
    expect(results).not.toBeNull();
    expect(results!.getAttribute('data-nearby-overflow')).toBe('auto');
    expect(results!.className).toMatch(/overflow-y-auto/);
  });
});
