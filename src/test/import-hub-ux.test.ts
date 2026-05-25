/**
 * Contract test — PR-IMPORT-UX-1 hub de importación
 *
 * Asegura que `ImportedContentPanel` cumple el canon
 * (`docs/contracts/import-canon.md`): 3 vías canónicas + biblioteca,
 * sin mezclar enriquecimiento / backfill / recovery / canonicalize.
 *
 * Sólo render UI. Mocks mínimos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
        order: () => ({ ascending: () => Promise.resolve({ data: [] }) }),
      }),
    }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
    storage: { from: () => ({ remove: () => Promise.resolve({}) }) },
  },
}));

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

function renderHub(tab: 'upload' | 'web' | 'onedrive' | 'documents') {
  render(
    <ImportedContentPanel
      isOpen={true}
      onClose={() => {}}
      defaultTab={tab}
    />,
  );
}

describe('PR-IMPORT-UX-1 · hub Contenido', () => {
  beforeEach(() => cleanup());

  it('expone exactamente tres vías de importación con labels canónicos', () => {
    renderHub('upload');
    expect(screen.getByText('Importar')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Archivos/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Web$/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /OneDrive · fotos/i })).toBeTruthy();
  });

  it('biblioteca expone Documentos importados', () => {
    renderHub('documents');
    expect(screen.getByText('Biblioteca')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Documentos importados/i })).toBeTruthy();
  });

  it('tab Archivos anuncia los formatos canónicos (KML/KMZ/GPX/GeoJSON/CSV)', () => {
    renderHub('upload');
    const body = document.body.textContent ?? '';
    for (const fmt of ['KML', 'KMZ', 'GPX', 'GeoJSON', 'CSV']) {
      expect(body).toContain(fmt);
    }
  });

  it('tab Web menciona URL y Atlas Obscura', () => {
    renderHub('web');
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/URL/i);
    expect(body).toMatch(/Atlas Obscura/i);
  });

  it('tab OneDrive · fotos menciona fotos y GPS', () => {
    renderHub('onedrive');
    const body = document.body.textContent?.toLowerCase() ?? '';
    expect(body).toContain('foto');
    expect(body).toContain('gps');
  });

  it('ningún heading/trigger del hub menciona enriquecer/backfill/recovery/canonicalize', () => {
    for (const tab of ['upload', 'web', 'onedrive', 'documents'] as const) {
      cleanup();
      renderHub(tab);
      const triggers = Array.from(document.querySelectorAll('[role="tab"]'))
        .map((el) => (el.textContent ?? '').toLowerCase())
        .join(' | ');
      for (const term of FORBIDDEN) {
        expect(triggers).not.toContain(term);
      }
    }
  });
});
