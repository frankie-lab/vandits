/**
 * Contract test — PR-IMPORT-UX-2 hub Contenido (hub + wizard).
 *
 * Ya NO es un panel de tabs. Es un router de vistas:
 *   hub → tres cards canónicas (file / web / onedrive) + link biblioteca
 *   wizard → shell común con back-to-hub
 *
 * Ver docs/contracts/import-canon.md §5 y mem://logic/import/import-canon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
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

const FORBIDDEN = ['enriquecer', 'enriquecimiento', 'backfill', 'recovery', 'canonicalize'];

function renderPanel(defaultTab?: 'upload' | 'web' | 'onedrive' | 'documents') {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ImportedContentPanel isOpen={true} onClose={() => {}} defaultTab={defaultTab} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('PR-IMPORT-UX-2 · hub Contenido (hub + wizard)', () => {
  beforeEach(() => cleanup());

  it('por defecto abre el hub con tres cards canónicas', () => {
    renderPanel();
    expect(document.querySelector('[data-import-hub="v2"]')).toBeTruthy();
    expect(document.querySelector('[data-import-channel-card="file"]')).toBeTruthy();
    expect(document.querySelector('[data-import-channel-card="web"]')).toBeTruthy();
    expect(document.querySelector('[data-import-channel-card="onedrive"]')).toBeTruthy();
  });

  it('el hub NO usa tabs como navegación principal', () => {
    renderPanel();
    const hub = document.querySelector('[data-import-hub="v2"]');
    expect(hub).toBeTruthy();
    // Dentro del hub no debe haber role=tablist (es selector de cards).
    expect(hub!.querySelector('[role="tablist"]')).toBeNull();
  });

  it('cada card anuncia título, qué acepta, qué crea, cuándo usarlo y CTA Empezar', () => {
    renderPanel();
    const fileCard = document.querySelector('[data-import-channel-card="file"]')!;
    const text = fileCard.textContent ?? '';
    expect(text).toMatch(/Importar desde fichero/i);
    expect(text).toMatch(/Qué acepta/i);
    expect(text).toMatch(/Qué crea/i);
    expect(text).toMatch(/Cuándo usarlo/i);
    expect(text).toMatch(/Empezar/i);
    for (const fmt of ['KML', 'KMZ', 'GPX', 'GeoJSON', 'CSV']) {
      expect(text).toContain(fmt);
    }
  });

  it('clic en card abre el wizard correspondiente con stepper de 5 pasos', () => {
    renderPanel();
    const card = document.querySelector('[data-import-channel-card="web"]') as HTMLButtonElement;
    fireEvent.click(card);
    expect(document.querySelector('[data-import-wizard="web"]')).toBeTruthy();
    const stepper = document.querySelector('[data-import-stepper="v2"]');
    expect(stepper).toBeTruthy();
    expect(stepper!.querySelectorAll('[data-import-step]')).toHaveLength(5);
  });

  it('wizard expone botón Volver al hub', () => {
    renderPanel('upload');
    expect(document.querySelector('[data-import-wizard="file"]')).toBeTruthy();
    expect(document.querySelector('[data-import-back-to-hub]')).toBeTruthy();
  });

  it('Documentos importados queda en biblioteca, accesible desde link secundario', () => {
    renderPanel();
    const link = document.querySelector('[data-import-library-link="v2"]') as HTMLButtonElement;
    expect(link).toBeTruthy();
    fireEvent.click(link);
    // DocumentsPanel renderizado tras click.
    expect(document.body.textContent).toMatch(/Documento|Biblioteca|Historial/i);
  });

  it('OneDrive wizard expone CTA "Auditar" como primera acción', () => {
    renderPanel('onedrive');
    expect(document.querySelector('[data-import-wizard="onedrive"]')).toBeTruthy();
    const body = (document.body.textContent ?? '').toLowerCase();
    expect(body).toContain('audita');
    expect(body).toContain('foto');
    expect(body).toContain('gps');
  });

  it('ningún paso/header del hub o wizards menciona enriquecer/backfill/recovery/canonicalize', () => {
    for (const tab of [undefined, 'upload', 'web', 'onedrive'] as const) {
      cleanup();
      renderPanel(tab);
      // Inspeccionar headers/stepper/cards — no el body operacional completo.
      const scope = [
        ...Array.from(document.querySelectorAll('[data-import-hub="v2"] h2, [data-import-hub="v2"] h3')),
        ...Array.from(document.querySelectorAll('[data-import-stepper="v2"]')),
        ...Array.from(document.querySelectorAll('[data-import-back-to-hub]')),
      ]
        .map((el) => (el.textContent ?? '').toLowerCase())
        .join(' | ');
      for (const term of FORBIDDEN) {
        expect(scope).not.toContain(term);
      }
    }
  });
});
