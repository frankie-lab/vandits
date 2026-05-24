/**
 * P-POI-CURATION-2.1 — POI-1b autolaunch del bloque Contexto cercano.
 *
 * Reglas verificadas:
 *  - POI-1b (sin coherence conflict + sin enrich) NO muestra botón
 *    intermedio "Contexto cercano".
 *  - El bloque <NearbyPanel variant="inline"> se monta directamente
 *    al renderizar el recovery block (autolaunch).
 *  - El host del autolaunch lleva data-nearby-autofire="1" como hook
 *    observable.
 *  - Re-renders del mismo host no producen segundo mount de NearbyPanel
 *    (anti-doble-disparo: NearbyPanel se monta una sola vez).
 *
 * NO se testea aquí la lógica interna de NearbyPanel (cubierta en sus
 * propios tests + integración E2E); aquí basta con confirmar identidad
 * de instancia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────
let nearbyPanelMountCount = 0;

vi.mock('@/domains/content/components/PointContextActions', () => ({
  NearbyPanel: (props: any) => {
    React.useEffect(() => {
      nearbyPanelMountCount += 1;
      return () => { /* unmount no-op */ };
    }, []);
    return (
      <div data-testid="nearby-panel-mock" data-location-id={props.location?.id}>
        nearby-panel
      </div>
    );
  },
}));

vi.mock('@/domains/content/hooks/use-enrichment-failure', () => ({
  useEnrichmentFailure: () => ({ parsed: null, loading: false }),
  enrichmentFailureStore: { invalidate: vi.fn() },
}));

vi.mock('@/domains/identity/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/domains/content/lib/point-visual-state', () => ({
  getPointVisualState: () => 'imported', // not 'enriched', so block stays
}));

vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    (selector?: any) => {
      const state = {
        documents: [
          {
            id: 'doc-1',
            locations: [{
              id: 'loc-1b',
              name: 'POI 1b',
              coordinates: { lat: 41.0, lng: 2.0 },
              isApproved: true,
              enrichmentStatus: null,
              enrichedData: null,
              placeType: null,
              continent: null,
              country: null,
              region: null,
              documentId: 'doc-1',
              geoHealth: 'ok',
            }],
          },
        ],
        updateLocation: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ updateLocation: vi.fn() }) },
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock('@/domains/content/lib/enrich-location', () => ({
  triggerEnrichLocation: vi.fn(),
}));

vi.mock('@/domains/content/lib/wiki-name-search', () => ({
  searchWikiCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ── Import after mocks ───────────────────────────────────────────────
import { UnenrichedRecoveryBlock } from '@/domains/content/components/UnenrichedRecoveryBlock';

const baseLocation = {
  id: 'loc-1b',
  name: 'POI 1b',
  coordinates: { lat: 41.0, lng: 2.0 },
  description: null,
  isApproved: true,
  enrichmentStatus: null,
  enrichedData: null,
  placeType: null,
  continent: null,
  country: null,
  region: null,
  documentId: 'doc-1',
  geoHealth: 'ok',
  customData: {},
} as any;

beforeEach(() => {
  nearbyPanelMountCount = 0;
  cleanup();
});

describe('P-POI-CURATION-2.1 — POI-1b autolaunch', () => {
  it('mounts NearbyPanel automatically and does NOT render an intermediate "Contexto cercano" button', () => {
    const { container, queryByText, getByTestId } = render(
      <UnenrichedRecoveryBlock location={baseLocation} variant="card" />,
    );

    // Panel inline montado en el primer render — sin clic previo.
    expect(getByTestId('nearby-panel-mock')).toBeTruthy();

    // Hook observable: data-nearby-autofire="1" presente.
    const autofireHost = container.querySelector('[data-nearby-autofire="1"]');
    expect(autofireHost).not.toBeNull();
    expect(autofireHost?.contains(getByTestId('nearby-panel-mock'))).toBe(true);

    // Ya no existe el botón intermedio que requería un clic extra.
    expect(queryByText(/^Contexto cercano$/)).toBeNull();
  });

  it('re-renderizar el mismo componente NO produce segundo mount de NearbyPanel (anti-doble-disparo)', () => {
    const { rerender } = render(
      <UnenrichedRecoveryBlock location={baseLocation} variant="card" />,
    );
    expect(nearbyPanelMountCount).toBe(1);

    // Forzar varios re-renders del mismo componente / misma identidad.
    rerender(<UnenrichedRecoveryBlock location={baseLocation} variant="card" />);
    rerender(<UnenrichedRecoveryBlock location={baseLocation} variant="card" />);
    rerender(<UnenrichedRecoveryBlock location={baseLocation} variant="card" />);

    // NearbyPanel se monta una sola vez por instancia / popup abierto.
    expect(nearbyPanelMountCount).toBe(1);
  });
});
