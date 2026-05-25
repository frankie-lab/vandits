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

describe('PR-IMPORT-UX-4-FIX rev2 · fila 2 contextual + footer sin navegación', () => {
  beforeEach(() => cleanup());

  type T = { tab: 'archivos' | 'web' | 'imagenes'; defaultTab: 'upload' | 'web' | 'onedrive';
             actionLabel: string; historyLabel: string; returnLabel: string };
  const TABS: T[] = [
    { tab: 'archivos', defaultTab: 'upload',   actionLabel: 'Subir archivos',  historyLabel: 'Histórico de archivos',  returnLabel: 'Subir archivo' },
    { tab: 'web',      defaultTab: 'web',      actionLabel: 'Seleccionar web', historyLabel: 'Jobs recientes',         returnLabel: 'Nueva web' },
    { tab: 'imagenes', defaultTab: 'onedrive', actionLabel: 'Subir imágenes',  historyLabel: 'Histórico de imágenes',  returnLabel: 'Subir imágenes' },
  ];

  it('el footer NUNCA contiene "Ver histórico" ni navegación secundaria', () => {
    for (const t of TABS) {
      cleanup();
      renderPanel(t.defaultTab);
      expect(document.querySelector('[data-import-secondary-cta]')).toBeNull();
      expect(document.body.textContent ?? '').not.toMatch(/Ver hist[óo]rico/);
    }
  });

  for (const t of TABS) {
    it(`tab ${t.tab}: fila 2 existe debajo de fila 1 con labels "${t.actionLabel}" / "${t.historyLabel}"`, () => {
      renderPanel(t.defaultTab);
      const row2 = document.querySelector(`[data-import-subview-control="${t.tab}"]`);
      expect(row2).toBeTruthy();
      const triggers = row2!.querySelectorAll('[data-import-subview-trigger]');
      expect(triggers.length).toBe(2);
      expect((triggers[0].textContent ?? '').trim()).toBe(t.actionLabel);
      expect((triggers[1].textContent ?? '').trim()).toBe(t.historyLabel);
      // Fila 2 vive DENTRO del content de la pestaña activa (debajo de fila 1).
      const content = document.querySelector(`[data-import-source-content="${t.tab}"]`);
      expect(content?.contains(row2!)).toBe(true);
    });

    it(`tab ${t.tab}: vista acción → footer = CTA primaria única (sin link de histórico)`, () => {
      renderPanel(t.defaultTab);
      const ctas = document.querySelectorAll(`[data-import-primary-cta="${t.tab}"]`);
      expect(ctas.length).toBe(1);
      expect(document.querySelector(`[data-import-return-to-action="${t.tab}"]`)).toBeNull();
      expect(document.querySelector('[data-import-secondary-cta]')).toBeNull();
    });

    it(`tab ${t.tab}: cambio a histórico se hace en fila 2; footer = "${t.returnLabel}"`, () => {
      renderPanel(t.defaultTab);
      const histTrigger = document.querySelector(
        `[data-import-subview-source="${t.tab}"][data-import-subview-trigger="history"]`,
      ) as HTMLButtonElement;
      expect(histTrigger).toBeTruthy();
      fireEvent.click(histTrigger);
      // Footer ahora muestra CTA de retorno con label exacto, y desaparece la primaria.
      expect(document.querySelector(`[data-import-primary-cta="${t.tab}"]`)).toBeNull();
      const ret = document.querySelector(`[data-import-return-to-action="${t.tab}"]`);
      expect(ret).toBeTruthy();
      expect((ret!.textContent ?? '').trim()).toBe(t.returnLabel);
      expect(document.body.textContent ?? '').not.toMatch(/Nueva importaci[óo]n/);
    });
  }

  it('NO existe sub-toggle legacy ni navegación secundaria de footer', () => {
    for (const t of TABS) {
      cleanup();
      renderPanel(t.defaultTab);
      expect(document.querySelector('[data-import-subtoggle]')).toBeNull();
      expect(document.querySelector('[data-import-subview]')).toBeNull();
      expect(document.querySelector('[data-import-secondary-cta]')).toBeNull();
    }
  });

  it('no existe CTA primaria duplicada inline dentro del cuerpo (solo en PanelFooter)', () => {
    renderPanel('upload');
    const body = document.querySelector('[data-import-source-content="archivos"]');
    expect(body?.querySelector('[data-import-primary-cta]')).toBeNull();
    expect(document.querySelectorAll('[data-import-primary-cta]').length).toBe(1);
  });

  it('FileUploadZone (vista acción archivos): dropzone aparece DESPUÉS de condiciones', () => {
    renderPanel('upload');
    const body = document.querySelector('[data-import-source-content="archivos"]') as HTMLElement;
    const html = body.innerHTML;
    const idxConfirma = html.indexOf('Antes de subir');
    const idxDropzone = html.indexOf('data-import-dropzone="files"');
    expect(idxConfirma).toBeGreaterThan(-1);
    expect(idxDropzone).toBeGreaterThan(-1);
    expect(idxConfirma).toBeLessThan(idxDropzone);
  });

  it('histórico de archivos: empty state lista los 5 formatos (KML, KMZ, GPX, GeoJSON, CSV)', () => {
    renderPanel('upload');
    const histTrigger = document.querySelector(
      '[data-import-subview-source="archivos"][data-import-subview-trigger="history"]',
    ) as HTMLButtonElement;
    fireEvent.click(histTrigger);
    const hist = document.querySelector('[data-import-history="archivos"]');
    const text = hist?.textContent ?? '';
    for (const fmt of ['KML', 'KMZ', 'GPX', 'GeoJSON', 'CSV']) {
      expect(text).toContain(fmt);
    }
    expect(text).toMatch(/No hay archivos importados todav[ií]a/);
  });

  it('histórico de imágenes: empty state explícito "No hay imágenes importadas todavía"', () => {
    renderPanel('onedrive');
    const histTrigger = document.querySelector(
      '[data-import-subview-source="imagenes"][data-import-subview-trigger="history"]',
    ) as HTMLButtonElement;
    fireEvent.click(histTrigger);
    const hist = document.querySelector('[data-import-history="imagenes"]');
    expect((hist?.textContent ?? '')).toMatch(/No hay im[áa]genes importadas todav[ií]a/);
  });
});

