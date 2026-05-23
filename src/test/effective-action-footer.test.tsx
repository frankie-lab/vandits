/**
 * EffectiveActionFooter — render contract test.
 *
 * Cubre:
 *   - footer renderiza en Explorar / Con deuda / Sin enriquecer.
 *   - count usa effectiveActionSet (props.locations.length).
 *   - sin selección manual → Eliminar NO está en el DOM.
 *   - con selección manual → Eliminar visible.
 *   - Exportar dispara `lovable:open-export-panel` con effectiveActionSet.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { EffectiveActionFooter } from '@/components/filters/EffectiveActionFooter';
import type { GeoLocation } from '@/types/location';

// Mocks mínimos: supabase + sonner + dispatchGlobalEvent.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: () => ({ update: () => ({ in: () => Promise.resolve({ error: null }) }) }),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'tid'),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));
vi.mock('@/lib/global-events', () => ({
  dispatchGlobalEvent: vi.fn(),
}));

function makeLoc(id: string, enriched = false): GeoLocation {
  return {
    id,
    name: `POI ${id}`,
    documentId: 'doc-1',
    coordinates: { lat: 0, lng: 0 },
    enrichedData: enriched ? { descripcion: 'Texto enriquecido suficientemente largo.' } : undefined,
  } as any;
}

describe('EffectiveActionFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // cleanup
  });

  it('renderiza en mode=all con count del effectiveActionSet', () => {
    const locs = [makeLoc('a'), makeLoc('b'), makeLoc('c')];
    render(
      <EffectiveActionFooter
        mode="all"
        locations={locs}
        hasUserSelection={false}
        scopeLabel={null}
        onClearSelection={() => {}}
      />,
    );
    expect(screen.getByTestId('effective-action-footer-label').textContent).toBe(
      'Acciones sobre 3 POIs',
    );
    expect(document.querySelector('[data-footer-mode="all"]')).toBeTruthy();
  });

  it('renderiza en mode=debt con "POIs con deuda"', () => {
    const locs = Array.from({ length: 13 }, (_, i) => makeLoc(`d${i}`));
    render(
      <EffectiveActionFooter
        mode="debt"
        locations={locs}
        hasUserSelection={false}
        scopeLabel={null}
        onClearSelection={() => {}}
      />,
    );
    expect(screen.getByTestId('effective-action-footer-label').textContent).toBe(
      'Acciones sobre 13 POIs con deuda',
    );
  });

  it('renderiza en mode=unenriched con "POIs sin enriquecer" + scopeLabel', () => {
    const locs = Array.from({ length: 240 }, (_, i) => makeLoc(`u${i}`));
    render(
      <EffectiveActionFooter
        mode="unenriched"
        locations={locs}
        hasUserSelection={false}
        scopeLabel="France"
        onClearSelection={() => {}}
      />,
    );
    expect(screen.getByTestId('effective-action-footer-label').textContent).toBe(
      'Acciones sobre 240 POIs sin enriquecer en France',
    );
  });

  it('sin userSelection → Eliminar NO está en el DOM', () => {
    render(
      <EffectiveActionFooter
        mode="all"
        locations={[makeLoc('a')]}
        hasUserSelection={false}
        scopeLabel={null}
        onClearSelection={() => {}}
      />,
    );
    expect(document.querySelector('[data-action="footer-delete"]')).toBeNull();
  });

  it('con userSelection → Eliminar visible', () => {
    render(
      <EffectiveActionFooter
        mode="all"
        locations={[makeLoc('a'), makeLoc('b')]}
        hasUserSelection={true}
        scopeLabel={null}
        onClearSelection={() => {}}
      />,
    );
    expect(document.querySelector('[data-action="footer-delete"]')).toBeTruthy();
  });

  it('Exportar dispara `lovable:open-export-panel` con effectiveActionSet', () => {
    const locs = [makeLoc('a'), makeLoc('b')];
    const handler = vi.fn();
    window.addEventListener('lovable:open-export-panel', handler as EventListener);
    render(
      <EffectiveActionFooter
        mode="debt"
        locations={locs}
        hasUserSelection={false}
        scopeLabel="Europe"
        onClearSelection={() => {}}
      />,
    );
    const btn = document.querySelector('[data-action="footer-export"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.locations).toEqual(locs);
    expect(detail.label).toBe('Con deuda · Europe');
    expect(detail.scope).toBe('public');
    window.removeEventListener('lovable:open-export-panel', handler as EventListener);
  });

  it('count=0 → Exportar disabled', () => {
    render(
      <EffectiveActionFooter
        mode="all"
        locations={[]}
        hasUserSelection={false}
        scopeLabel={null}
        onClearSelection={() => {}}
      />,
    );
    const btn = document.querySelector(
      '[data-action="footer-export"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
