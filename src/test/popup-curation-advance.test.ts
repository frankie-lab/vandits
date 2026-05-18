/**
 * P-POI-CURATION-3 (Fase 1) — orchestrator unit tests.
 *
 * Drives `advancePoiCurationUntilBlocked` over the canonical scenarios:
 *  1. POI-10 short-circuit (no stages).
 *  2. POI-9 visited + rated short-circuit.
 *  3. POI-9 visited without rating → blocker=manual-rating.
 *  4. POI-1 + geo='ok' + enrich OK → endLevel=9, blocker=none, "POI enriquecido".
 *  5. POI-1 + geo='broken' → endLevel=3, blocker=geo-conflict, no enrich.
 *  6. POI-1 + geo='ok' + enrich llm_unverifiable → blocker=enrichment-ambiguous.
 *  7. POI-1 + geo='ok' + enrich name_coordinate_mismatch → blocker=enrichment-ambiguous.
 *  8. No batch language ever appears in resulting messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type LocStub = {
  id: string;
  name: string;
  geoHealth?: 'ok' | 'broken' | 'partial' | 'stale_name' | 'empty' | null;
  enrichedData?: any;
  customData?: Record<string, string>;
};

const h = vi.hoisted(() => ({
  fakeLoc: {
    id: 'loc-orchestrator-1',
    name: 'POI bajo prueba',
    geoHealth: null as LocStub['geoHealth'],
    enrichedData: undefined as any,
    customData: {} as Record<string, string>,
  } as LocStub,
  // Geo job state stub.
  subscribers: [] as Array<(s: any, prev: any) => void>,
  storeState: { lastResult: null as any },
  startMock: vi.fn(),
  // Fake supabase row to return for v_locations_resolved fetch.
  vRow: null as any,
  // triggerEnrichLocation behavior per-test.
  enrichResult: { success: true } as { success: boolean; error?: string },
}));

function completeJob(status: 'completed' | 'failed' | 'canceled' = 'completed') {
  const prev = { lastResult: h.storeState.lastResult };
  h.storeState.lastResult = {
    finishedAt: Date.now() + 1,
    status,
    mode: 'reconcile',
    totalProcessed: 1,
    totalUpdated: 1,
    failed: 0,
    durationMs: 1,
    initialPending: 1,
  };
  for (const cb of h.subscribers) cb({ ...h.storeState }, prev);
}

vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: {
    getState: () => ({
      start: h.startMock,
      clearLastResult: () => { h.storeState.lastResult = null; },
    }),
    subscribe: (cb: (s: any, prev: any) => void) => {
      h.subscribers.push(cb);
      return () => {
        const i = h.subscribers.indexOf(cb);
        if (i >= 0) h.subscribers.splice(i, 1);
      };
    },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: h.vRow, error: null }),
    })),
  },
}));

vi.mock('@/domains/content', () => ({
  useLocationsStore: {
    getState: () => ({
      documents: [{ id: 'doc-1', locations: [h.fakeLoc] }],
      updateLocation: (_id: string, updates: Partial<LocStub>) => {
        Object.assign(h.fakeLoc, updates);
      },
    }),
  },
}));

vi.mock('@/domains/content/lib/enrich-location', () => ({
  triggerEnrichLocation: vi.fn().mockImplementation(async () => h.enrichResult),
}));

vi.mock('@/domains/content/lib/db-transformers', () => ({
  dbLocationToGeoLocation: (row: any) => row as LocStub,
}));

// Stub the operational-state helper so it does not require real DOM.
vi.mock('@/components/map/popup-operational-state', () => ({
  setPopupOperationalState: vi.fn(),
}));

import { advancePoiCurationUntilBlocked } from '@/domains/content/lib/advance-poi-curation';

const BATCH_LANG = /Geocodificación|puntos revisados|segundo plano|job lanzado/i;

function resetLoc(patch: Partial<LocStub>) {
  h.fakeLoc.name = patch.name ?? 'POI bajo prueba';
  h.fakeLoc.geoHealth = patch.geoHealth ?? null;
  h.fakeLoc.enrichedData = patch.enrichedData;
  h.fakeLoc.customData = patch.customData ?? {};
}

beforeEach(() => {
  h.subscribers.length = 0;
  h.storeState.lastResult = null;
  h.startMock.mockReset();
  h.startMock.mockResolvedValue(undefined);
  h.vRow = null;
  h.enrichResult = { success: true };
  resetLoc({});
});

// Long, plausible enriched descripcion (>= 60 chars, not unverifiable).
const LONG_DESC =
  'Castillo medieval del siglo XII situado sobre un promontorio rocoso con vistas al valle del río y restos de murallas romanas adyacentes.';

describe('advancePoiCurationUntilBlocked — short-circuits', () => {
  it('POI-10 (enriched + ok + visited + rated) → stopped immediately', async () => {
    resetLoc({
      geoHealth: 'ok',
      enrichedData: { descripcion: LONG_DESC },
      customData: { visited: 'true', user_rating: '5' },
    });
    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');
    expect(result.startLevel).toBe(10);
    expect(result.endLevel).toBe(10);
    expect(result.stagesRun).toEqual([]);
    expect(result.blocker).toBe('none');
    expect(result.message).toBe('POI completamente curado');
    expect(h.startMock).not.toHaveBeenCalled();
  });

  it('POI-9 visited without rating → blocker=manual-rating, no stages', async () => {
    resetLoc({
      geoHealth: 'ok',
      enrichedData: { descripcion: LONG_DESC },
      customData: { visited: 'true' },
    });
    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');
    expect(result.endLevel).toBe(9);
    expect(result.blocker).toBe('manual-rating');
    expect(result.stagesRun).toEqual([]);
    expect(h.startMock).not.toHaveBeenCalled();
  });

  it('POI-9 not visited (already healthy) → blocker=none, no stages', async () => {
    resetLoc({
      geoHealth: 'ok',
      enrichedData: { descripcion: LONG_DESC },
      customData: {},
    });
    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');
    expect(result.endLevel).toBe(9);
    expect(result.blocker).toBe('none');
    expect(result.message).toBe('POI enriquecido');
    expect(h.startMock).not.toHaveBeenCalled();
  });
});

describe('advancePoiCurationUntilBlocked — POI-1 pipeline', () => {
  it('geo OK + enrich OK → endLevel=9, "POI enriquecido"', async () => {
    resetLoc({ geoHealth: null, enrichedData: undefined });
    // After validate-geo, supabase fetch returns geoHealth='ok' (still unenriched).
    h.vRow = {
      id: h.fakeLoc.id,
      name: h.fakeLoc.name,
      geoHealth: 'ok',
      enrichedData: undefined,
      customData: {},
    };
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('completed'));
    });
    // After enrich, simulate that triggerEnrichLocation populated the store.
    h.enrichResult = { success: true };
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockImplementation(async () => {
      h.fakeLoc.enrichedData = { descripcion: LONG_DESC };
      h.fakeLoc.geoHealth = 'ok';
      return { success: true };
    });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.stagesRun).toEqual(['validate-geo', 'recompute', 'enrich', 'recompute']);
    expect(result.endLevel).toBeGreaterThanOrEqual(9);
    expect(result.blocker).toBe('none');
    expect(result.message).toBe('POI enriquecido');
    expect(result.message).not.toMatch(BATCH_LANG);
  });

  it('geo broken → endLevel=3, blocker=geo-conflict, NO enrich', async () => {
    resetLoc({ geoHealth: null });
    h.vRow = {
      id: h.fakeLoc.id,
      name: h.fakeLoc.name,
      geoHealth: 'broken',
      enrichedData: undefined,
      customData: {},
    };
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('completed'));
    });
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockReset();
    enrichMock.mockResolvedValue({ success: true });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.endLevel).toBe(3);
    expect(result.blocker).toBe('geo-conflict');
    expect(result.message).toBe('Se requiere resolución manual: conflicto geográfico');
    expect(enrichMock).not.toHaveBeenCalled();
    expect(result.message).not.toMatch(BATCH_LANG);
  });

  it('geo OK + enrich llm_unverifiable → blocker=enrichment-ambiguous', async () => {
    resetLoc({ geoHealth: null });
    h.vRow = {
      id: h.fakeLoc.id,
      name: h.fakeLoc.name,
      geoHealth: 'ok',
      enrichedData: undefined,
      customData: {},
    };
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('completed'));
    });
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockResolvedValue({ success: false, error: 'llm_unverifiable' });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.blocker).toBe('enrichment-ambiguous');
    expect(result.message).toBe('Se requiere resolución manual: datos ambiguos');
    expect(result.message).not.toMatch(BATCH_LANG);
  });

  it('geo OK + enrich name_coordinate_mismatch → blocker=enrichment-ambiguous', async () => {
    resetLoc({ geoHealth: null });
    h.vRow = {
      id: h.fakeLoc.id,
      name: h.fakeLoc.name,
      geoHealth: 'ok',
      enrichedData: undefined,
      customData: {},
    };
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('completed'));
    });
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockResolvedValue({ success: false, error: 'name_coordinate_mismatch' });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.blocker).toBe('enrichment-ambiguous');
    expect(result.message).not.toMatch(BATCH_LANG);
  });

  it('geo job failed → blocker=enrichment-ambiguous, no enrich attempted', async () => {
    resetLoc({ geoHealth: null });
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('failed'));
    });
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockReset();
    enrichMock.mockResolvedValue({ success: true });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.blocker).toBe('enrichment-ambiguous');
    expect(enrichMock).not.toHaveBeenCalled();
  });

  it('geo OK but remains partial (no FK) → STOP with neutral "Geografía validada" (heal-rings fase 3.1)', async () => {
    resetLoc({ geoHealth: null });
    h.vRow = {
      id: h.fakeLoc.id,
      name: h.fakeLoc.name,
      geoHealth: 'partial',
      enrichedData: undefined,
      customData: {},
    };
    h.startMock.mockImplementation(async () => {
      queueMicrotask(() => completeJob('completed'));
    });
    const enrichMock = (await import('@/domains/content/lib/enrich-location')).triggerEnrichLocation as any;
    enrichMock.mockReset();
    enrichMock.mockResolvedValue({ success: true });

    const result = await advancePoiCurationUntilBlocked(h.fakeLoc.id, 'validate-geo', 'popup-x');

    expect(result.blocker).toBe('none');
    expect(result.message).toBe('Geografía validada');
    // Heal-rings/enrich on partial is OUT OF SCOPE for fase 1.
    expect(enrichMock).not.toHaveBeenCalled();
  });
});
