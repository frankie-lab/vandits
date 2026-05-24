/**
 * EffectiveActionFooter — render contract test (single primary + "Más acciones").
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { EffectiveActionFooter } from '@/components/filters/EffectiveActionFooter';
import type { GeoLocation } from '@/types/location';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: () => ({ update: () => ({ in: () => Promise.resolve({ error: null }) }) }),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(), success: vi.fn(), info: vi.fn(),
    loading: vi.fn(() => 'tid'), warning: vi.fn(), message: vi.fn(),
  },
}));
vi.mock('@/lib/global-events', () => ({ dispatchGlobalEvent: vi.fn() }));

function makeLoc(id: string, enriched = false): GeoLocation {
  return {
    id, name: `POI ${id}`, documentId: 'doc-1',
    coordinates: { lat: 0, lng: 0 },
    enrichedData: enriched ? { descripcion: 'Texto enriquecido suficientemente largo.' } : undefined,
  } as any;
}

const baseProps = {
  hasUserSelection: false,
  scopeLabel: null,
  onClearSelection: () => {},
};

function openMenu() {
  const trigger = document.querySelector('[data-testid="footer-more-actions"]') as HTMLButtonElement;
  expect(trigger).toBeTruthy();
  act(() => { fireEvent.pointerDown(trigger, { button: 0 }); fireEvent.click(trigger); });
}

describe('EffectiveActionFooter — single primary + dropdown', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('label usa count del effectiveActionSet', () => {
    render(<EffectiveActionFooter mode="all" locations={[makeLoc('a'), makeLoc('b'), makeLoc('c')]} {...baseProps} />);
    expect(screen.getByTestId('effective-action-footer-label').textContent).toBe('Acciones sobre 3 POIs');
  });

  describe('mode=all (Explorar)', () => {
    it('primary = Exportar; Enriquecer/Etiquetar/Reclasificar NO son top-level', () => {
      render(<EffectiveActionFooter mode="all" locations={[makeLoc('a')]} {...baseProps} />);
      expect(document.querySelector('[data-testid="footer-primary-export"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="footer-primary-enrich"]')).toBeNull();
      expect(document.querySelector('[data-testid="footer-primary-resolve-debt"]')).toBeNull();
      // Top-level (fuera del menú abierto): los items del dropdown no deben existir aún.
      expect(document.querySelector('[data-testid="footer-menu-enrich"]')).toBeNull();
      expect(document.querySelector('[data-testid="footer-menu-tag"]')).toBeNull();
      expect(document.querySelector('[data-testid="footer-menu-reclassify"]')).toBeNull();
    });

    it('dropdown contiene Enriquecer si hay enrichable, no Exportar', () => {
      render(<EffectiveActionFooter mode="all" locations={[makeLoc('a'), makeLoc('b', true)]} {...baseProps} />);
      openMenu();
      expect(document.querySelector('[data-testid="footer-menu-enrich"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="footer-menu-export"]')).toBeNull();
      const tag = document.querySelector('[data-testid="footer-menu-tag"]')!;
      const recl = document.querySelector('[data-testid="footer-menu-reclassify"]')!;
      expect(tag.getAttribute('data-disabled') ?? tag.getAttribute('aria-disabled')).toBeTruthy();
      expect(recl.getAttribute('data-disabled') ?? recl.getAttribute('aria-disabled')).toBeTruthy();
    });
  });

  describe('mode=debt (Mantener → Con deuda)', () => {
    it('primary = Resolver deuda, Exportar NO es primary', () => {
      const onResolveDebt = vi.fn();
      render(<EffectiveActionFooter mode="debt" locations={[makeLoc('a')]} {...baseProps} onResolveDebt={onResolveDebt} />);
      expect(document.querySelector('[data-testid="footer-primary-resolve-debt"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="footer-primary-export"]')).toBeNull();
    });

    it('click primary llama onResolveDebt', () => {
      const onResolveDebt = vi.fn();
      render(<EffectiveActionFooter mode="debt" locations={[makeLoc('a')]} {...baseProps} onResolveDebt={onResolveDebt} />);
      fireEvent.click(document.querySelector('[data-testid="footer-primary-resolve-debt"]') as HTMLButtonElement);
      expect(onResolveDebt).toHaveBeenCalledTimes(1);
    });

    it('dropdown contiene Exportar', () => {
      render(<EffectiveActionFooter mode="debt" locations={[makeLoc('a')]} {...baseProps} onResolveDebt={() => {}} />);
      openMenu();
      expect(document.querySelector('[data-testid="footer-menu-export"]')).toBeTruthy();
    });

    it('click Exportar en dropdown dispara lovable:open-export-panel con effectiveActionSet', () => {
      const locs = [makeLoc('a'), makeLoc('b')];
      const handler = vi.fn();
      window.addEventListener('lovable:open-export-panel', handler as EventListener);
      render(<EffectiveActionFooter mode="debt" locations={locs} {...baseProps} scopeLabel="Europe" onResolveDebt={() => {}} />);
      openMenu();
      const item = document.querySelector('[data-testid="footer-menu-export"]') as HTMLElement;
      expect(item).toBeTruthy();
      fireEvent.click(item);
      expect(handler).toHaveBeenCalledTimes(1);
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.locations).toEqual(locs);
      expect(detail.label).toBe('Con deuda · Europe');
      expect(detail.scope).toBe('public');
      window.removeEventListener('lovable:open-export-panel', handler as EventListener);
    });
  });

  describe('mode=unenriched (Mantener → Sin enriquecer)', () => {
    it('primary = Enriquecer IA, Exportar NO es primary', () => {
      render(<EffectiveActionFooter mode="unenriched" locations={[makeLoc('a')]} {...baseProps} />);
      expect(document.querySelector('[data-testid="footer-primary-enrich"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="footer-primary-export"]')).toBeNull();
    });

    it('dropdown contiene Exportar', () => {
      render(<EffectiveActionFooter mode="unenriched" locations={[makeLoc('a')]} {...baseProps} />);
      openMenu();
      expect(document.querySelector('[data-testid="footer-menu-export"]')).toBeTruthy();
    });
  });

  describe('Eliminar', () => {
    it('hasUserSelection=false → Eliminar NO está en el menú', () => {
      render(<EffectiveActionFooter mode="all" locations={[makeLoc('a')]} {...baseProps} />);
      openMenu();
      expect(document.querySelector('[data-testid="footer-menu-delete"]')).toBeNull();
    });

    it('hasUserSelection=true → Eliminar visible en el menú', () => {
      render(<EffectiveActionFooter mode="all" locations={[makeLoc('a')]} {...baseProps} hasUserSelection={true} />);
      openMenu();
      expect(document.querySelector('[data-testid="footer-menu-delete"]')).toBeTruthy();
    });
  });

  describe('Estado vacío', () => {
    it('count=0 deshabilita primary y trigger Más acciones', () => {
      render(<EffectiveActionFooter mode="all" locations={[]} {...baseProps} />);
      const primary = document.querySelector('[data-testid="footer-primary-export"]') as HTMLButtonElement;
      const more = document.querySelector('[data-testid="footer-more-actions"]') as HTMLButtonElement;
      expect(primary.disabled).toBe(true);
      expect(more.disabled).toBe(true);
    });
  });
});
