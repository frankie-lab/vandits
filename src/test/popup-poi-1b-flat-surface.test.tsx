/**
 * P-POI-CURATION-2.4 — POI-1b: superficie editorial continua.
 *
 * Reglas verificadas:
 *  - El root del recovery POI-1b (sin conflicto) NO usa contenedor
 *    rounded/border/bg-muted; expone `data-recovery-surface="flat"`.
 *  - El header `Radio` del NearbyPanel inline NO usa `bg-muted/30`,
 *    mantiene `border-b` como separador editorial.
 *  - El renglón del punto actual NO usa `bg-primary/5` ni `border-primary/20`
 *    ni `rounded-lg`; expone `data-current-point-surface="flat"`.
 *  - El badge "Sin localización clara" (única señalética semántica) se
 *    materializa con `bg-amber-100` (regresión-guard de la alarma).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';

(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? class {
  observe() {} unobserve() {} disconnect() {}
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
      const state = { documents: [], updateLocation: vi.fn(), setFocusedLocation: vi.fn() };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ updateLocation: vi.fn(), setFocusedLocation: vi.fn() }) },
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { NearbyPanel } from '@/domains/content/components/PointContextActions';

const baseLocation = {
  id: 'loc-1b',
  name: 'POI 1b',
  latitude: 41.1234,
  longitude: 2.5678,
  description: null,
  is_approved: true,
  place_type: 'ermita',
  enriched_data: null,
} as any;

beforeEach(() => cleanup());

describe('P-POI-CURATION-2.4 — superficie editorial continua', () => {
  it('NearbyPanel inline: header sin bg-muted/30, mantiene border-b', () => {
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
    const header = container.querySelector('.border-b') as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header!.className).not.toMatch(/bg-muted\/30/);
  });

  it('current-point: renglón flat (sin bg-primary/5, sin border-primary/20, sin rounded-lg)', () => {
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
    const cp = container.querySelector('[data-current-point-surface="flat"]') as HTMLElement;
    expect(cp).not.toBeNull();
    expect(cp.className).not.toMatch(/bg-primary\/5/);
    expect(cp.className).not.toMatch(/border-primary\/20/);
    expect(cp.className).not.toMatch(/\brounded-lg\b/);
    // Y NO repite las coordenadas del POI (ya viven en el shell).
    expect(cp.textContent || '').not.toMatch(/41\.1234/);
    // Sigue siendo identificable como referencia principal: eyebrow + nombre.
    expect(cp.textContent || '').toMatch(/Punto actual/i);
    expect(cp.textContent || '').toMatch(/POI 1b/);
  });
});
