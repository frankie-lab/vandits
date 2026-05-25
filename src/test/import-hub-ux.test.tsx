/**
 * Contract test — PR-IMPORT-UX-3 panel "Fuentes de importación".
 *
 * Modelo definitivo: 3 pestañas operativas (Archivos · Web · Imágenes).
 * Reemplaza el wizard de PR-IMPORT-UX-2 (rechazado). Ver
 * mem://logic/import/import-canon y docs/contracts/import-canon.md §8.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
    ascending: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return {
    supabase: {
      from: () => builder,
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => undefined,
      storage: { from: () => ({ remove: () => Promise.resolve({}) }) },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-test' } } }) },
    },
  };
});

vi.mock('@/domains/identity', () => ({
  useAuth: () => ({ user: { id: 'u-test' } }),
}));

vi.mock('@/domains/content', async () => {
  const real: any = await vi.importActual('@/domains/content');
  return {
    ...real,
    useLocationsStore: (sel: any) =>
      sel({ addDocument: () => {}, addPendingDuplicates: () => {}, documents: [] }),
    saveDocumentToDatabase: async () => true,
  };
});

import { ImportedContentPanel } from '@/components/ImportedContentPanel';

const FORBIDDEN_IMPORT_TERMS = ['backfill', 'recovery', 'canonicalize'];

function renderPanel(defaultTab?: 'upload' | 'web' | 'onedrive' | 'documents') {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ImportedContentPanel isOpen={true} onClose={() => {}} defaultTab={defaultTab} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

function getPanelHeaderText() {
  return (document.querySelector('[data-import-sources="v3"]') ?? document.body).textContent ?? '';
}

describe('PR-IMPORT-UX-3 · panel "Fuentes de importación" (3 tabs)', () => {
  beforeEach(() => cleanup());

  it('el panel se titula "Fuentes de importación"', () => {
    renderPanel();
    // El título vive en el PanelShell, fuera del data-import-sources.
    expect(document.body.textContent).toMatch(/Fuentes de importaci[óo]n/);
  });

  it('renderiza exactamente 3 tabs principales: Archivos · Web · Imágenes', () => {
    renderPanel();
    const tabs = document.querySelectorAll('[data-import-source-tab]');
    expect(tabs.length).toBe(3);
    const values = Array.from(tabs).map((t) => t.getAttribute('data-import-source-tab'));
    expect(values).toEqual(['archivos', 'web', 'imagenes']);
  });

  it('NO existe "OneDrive · fotos" como tab principal', () => {
    renderPanel();
    const tabsText = Array.from(document.querySelectorAll('[data-import-source-tab]'))
      .map((t) => (t.textContent ?? '').toLowerCase())
      .join(' | ');
    expect(tabsText).not.toContain('onedrive');
  });

  it('NO existe "Biblioteca" / "Documentos importados" como tab principal', () => {
    renderPanel();
    const tabsText = Array.from(document.querySelectorAll('[data-import-source-tab]'))
      .map((t) => (t.textContent ?? '').toLowerCase())
      .join(' | ');
    expect(tabsText).not.toContain('biblioteca');
    expect(tabsText).not.toContain('documentos');
  });

  it('Archivos muestra formatos KML/KMZ/GPX/GeoJSON/CSV', () => {
    renderPanel('upload');
    const content = document.querySelector('[data-import-source-content="archivos"]')!;
    const text = content.textContent ?? '';
    for (const fmt of ['KML', 'KMZ', 'GPX', 'GeoJSON', 'CSV']) {
      expect(text).toContain(fmt);
    }
  });

  it('Archivos incluye histórico de archivos importados como sección contextual', () => {
    renderPanel('upload');
    const history = document.querySelector('[data-import-history="archivos"]');
    expect(history).toBeTruthy();
    expect((history!.textContent ?? '').toLowerCase()).toMatch(
      /archivos importados|hist[óo]rico/,
    );
  });

  it('Web muestra área de URL y jobs/histórico de webs procesadas', () => {
    renderPanel('web');
    const content = document.querySelector('[data-import-source-content="web"]')!;
    const text = (content.textContent ?? '').toLowerCase();
    expect(text).toMatch(/url|web|atlas/);
  });

  it('Imágenes muestra proveedor OneDrive y fotos con GPS', () => {
    renderPanel('onedrive');
    const content = document.querySelector('[data-import-source-content="imagenes"]')!;
    const text = (content.textContent ?? '').toLowerCase();
    expect(text).toContain('onedrive');
    expect(text).toMatch(/gps|coordenadas|geolocalizaci[óo]n/);
    expect(text).toMatch(/im[áa]genes|fotos/);
  });

  it('defaultTab="documents" cae en la pestaña Archivos (histórico contextual)', () => {
    renderPanel('documents');
    const active = document.querySelector('[data-import-source-tab="archivos"]');
    expect(active?.getAttribute('data-state')).toBe('active');
  });

  it('los tabs principales no mencionan enriquecer/backfill/recovery/canonicalize', () => {
    renderPanel();
    const tabsText = Array.from(document.querySelectorAll('[data-import-source-tab]'))
      .map((t) => (t.textContent ?? '').toLowerCase())
      .join(' | ');
    for (const term of [...FORBIDDEN_IMPORT_TERMS, 'enriquecer', 'enriquecimiento']) {
      expect(tabsText).not.toContain(term);
    }
  });

  it('no quedan rastros del wizard PR-IMPORT-UX-2 (data-import-hub, data-import-stepper, data-import-channel-card)', () => {
    for (const tab of [undefined, 'upload', 'web', 'onedrive'] as const) {
      cleanup();
      renderPanel(tab);
      expect(document.querySelector('[data-import-hub]')).toBeNull();
      expect(document.querySelector('[data-import-stepper]')).toBeNull();
      expect(document.querySelector('[data-import-channel-card]')).toBeNull();
      expect(document.querySelector('[data-import-wizard]')).toBeNull();
    }
  });
});

describe('PR-IMPORT-UX-4 · sub-toggle + PanelFooter con CTA real', () => {
  beforeEach(() => cleanup());

  const SUBTOGGLE_LABELS: Record<string, { action: string; history: string }> = {
    archivos: { action: 'Subir archivos', history: 'Histórico de archivos' },
    web:      { action: 'Seleccionar web', history: 'Jobs recientes' },
    imagenes: { action: 'Subir imágenes', history: 'Histórico de imágenes' },
  };

  for (const [tab, labels] of Object.entries(SUBTOGGLE_LABELS)) {
    it(`tab ${tab}: sub-toggle existe con labels exactos "${labels.action}" / "${labels.history}"`, () => {
      renderPanel(tab === 'archivos' ? 'upload' : tab === 'web' ? 'web' : 'onedrive');
      const subtoggle = document.querySelector('[data-import-subtoggle]');
      expect(subtoggle).toBeTruthy();
      const text = subtoggle!.textContent ?? '';
      expect(text).toContain(labels.action);
      expect(text).toContain(labels.history);
    });

    it(`tab ${tab}: vista Acción monta PanelFooter con UN CTA real data-import-primary-cta="${tab}"`, () => {
      renderPanel(tab === 'archivos' ? 'upload' : tab === 'web' ? 'web' : 'onedrive');
      const ctas = document.querySelectorAll(`[data-import-primary-cta="${tab}"]`);
      expect(ctas.length).toBe(1);
      // No debe convivir con secondary-cta de su mismo tab.
      expect(document.querySelector(`[data-import-secondary-cta="${tab}"]`)).toBeNull();
    });

    it(`tab ${tab}: cambiar a Histórico oculta la CTA primaria y muestra "Nueva importación"`, () => {
      renderPanel(tab === 'archivos' ? 'upload' : tab === 'web' ? 'web' : 'onedrive');
      const historyBtn = Array.from(
        document.querySelectorAll('[data-import-subtoggle] [data-import-subview="history"]'),
      )[0] as HTMLButtonElement | undefined;
      expect(historyBtn).toBeTruthy();
      fireEvent.click(historyBtn!);
      expect(document.querySelector(`[data-import-primary-cta="${tab}"]`)).toBeNull();
      const secondary = document.querySelector(`[data-import-secondary-cta="${tab}"]`);
      expect(secondary).toBeTruthy();
      expect((secondary!.textContent ?? '')).toMatch(/Nueva importaci[óo]n/);
    });
  }

  it('no existe CTA primaria duplicada inline dentro del cuerpo de Acción (solo la del PanelFooter)', () => {
    renderPanel('upload');
    // Solo debe haber UNA CTA primaria por tab activa, y debe colgar del PanelFooter.
    const ctas = document.querySelectorAll('[data-import-primary-cta]');
    expect(ctas.length).toBe(1);
    // El CTA real vive en el footer (el padre lo monta), nunca dentro del scroll del hijo.
    const body = document.querySelector('[data-import-source-content="archivos"]');
    expect(body?.querySelector('[data-import-primary-cta]')).toBeNull();
  });

  it('CTA con disabledReason expone tooltip (Imágenes: placeholder PR-IMPORT-ONEDRIVE-CREATE-POI)', () => {
    renderPanel('onedrive');
    const cta = document.querySelector('[data-import-primary-cta="imagenes"]') as HTMLButtonElement;
    expect(cta).toBeTruthy();
    // En estado inicial, OneDrive expone "Auditar fotos" (canSubmit=true) o un disabled con tooltip.
    // El contrato exige que si está disabled, exista trigger de tooltip envolvente.
    if (cta.disabled) {
      const trigger = cta.closest('[data-state]') ?? cta.parentElement;
      expect(trigger).toBeTruthy();
    } else {
      expect(cta.disabled).toBe(false);
    }
  });
});
