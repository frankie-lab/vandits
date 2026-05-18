import { describe, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fakeLoc: {
    id: 'x', name: 'X',
    geoHealth: 'ok' as any,
    enrichedData: { descripcion: 'rich' },
    customData: { visited: 'true', user_rating: '5' },
  },
}));

vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: {
    getState: () => ({ start: vi.fn(), clearLastResult: vi.fn() }),
    subscribe: () => () => {},
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) },
}));
vi.mock('@/domains/content', () => ({
  useLocationsStore: { getState: () => ({ documents: [{ id: 'd', locations: [h.fakeLoc] }], updateLocation: vi.fn() }) },
}));
vi.mock('@/domains/content/lib/enrich-location', () => ({ triggerEnrichLocation: vi.fn() }));
vi.mock('@/domains/content/lib/db-transformers', () => ({ dbLocationToGeoLocation: (r:any)=>r }));
vi.mock('@/components/map/popup-operational-state', () => ({ setPopupOperationalState: vi.fn() }));

import { advancePoiCurationUntilBlocked } from '@/domains/content/lib/advance-poi-curation';

describe('debug', () => {
  it('runs', async () => {
    console.log('BEFORE CALL');
    const r = await advancePoiCurationUntilBlocked('x', 'validate-geo', 'p');
    console.log('AFTER CALL', r);
  });
});
