/**
 * P-POI-CURATION-2 — `curation-primary` real wiring.
 *
 * Verifies the four sub-actions of the unified curation primary button:
 *  - validate-geo: launches a real geocoding job with mode='reconcile' and
 *    operational loading state. Double-click guard prevents duplicate jobs.
 *    Errors clear the loading state.
 *  - rate-experience: focuses the ratings block (or shows a visited-required
 *    toast when the user has not marked the POI as visited).
 *  - resolve-conflict / heal-poi: explicit "pending implementation" toast.
 *
 * No silent no-op is ever acceptable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mocks (vi.hoisted so factories can reference them safely) ────────
const h = vi.hoisted(() => ({
  startMock: vi.fn(),
  clearLastResultMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  toastLoading: vi.fn(),
  toastInfo: vi.fn(),
  toastDismiss: vi.fn(),
}));
const {
  startMock,
  clearLastResultMock,
  toastSuccess,
  toastError,
  toastMessage,
  toastLoading,
} = h;

vi.mock('@/stores/geocoding-job-store', () => ({
  useGeocodingJobStore: {
    getState: () => ({
      start: h.startMock,
      clearLastResult: h.clearLastResultMock,
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(
    (msg: string) => h.toastMessage(msg),
    {
      success: h.toastSuccess,
      error: h.toastError,
      message: h.toastMessage,
      loading: h.toastLoading,
      info: h.toastInfo,
      dismiss: h.toastDismiss,
    },
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      contains: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@/domains/identity', () => ({
  usePermissions: () => ({ isMaster: () => false }),
}));

vi.mock('@/hooks/use-v2-flags', () => ({
  getV2Flags: vi.fn().mockResolvedValue({ v2DataWriteUserPlaces: false }),
}));

vi.mock('@/domains/v2/dual-write-user-place', () => ({
  dualWriteVisited: vi.fn(),
  dualWriteRating: vi.fn(),
  dualWriteAdopt: vi.fn(),
}));

vi.mock('@/services/user-place.service', () => ({
  userPlaceService: { markVisited: vi.fn(), setVisitStatus: vi.fn(), rate: vi.fn() },
}));

vi.mock('@/domains/content/lib/enrich-location', () => ({
  triggerEnrichLocation: vi.fn().mockResolvedValue(undefined),
}));

const fakeLocation = {
  id: 'loc-validate-1',
  name: 'POI bajo prueba',
  coordinates: { lat: 0, lng: 0 },
  customData: {} as Record<string, string>,
};

vi.mock('@/domains/content', () => ({
  useLocationsStore: Object.assign(
    () => ({
      documents: [{ id: 'doc-1', locations: [fakeLocation] }],
      updateLocation: vi.fn(),
    }),
    {
      getState: () => ({
        documents: [{ id: 'doc-1', locations: [fakeLocation] }],
        updateLocation: vi.fn(),
        setFocusedLocation: vi.fn(),
        getLocationOwnership: () => ({ isOwn: true }),
      }),
    },
  ),
}));

import { usePopupActions } from '@/domains/content/hooks/use-popup-actions';
import { getPopupIdForLocation } from '@/components/map/popup-operational-state';

function mountPopupDom(locationId: string, opts?: { withRatings?: boolean }) {
  const popupId = getPopupIdForLocation(locationId);
  document.body.innerHTML = `
    <div id="${popupId}" data-popup-version="geo-canonical-v1" data-popup-operational-state="idle">
      <div data-popup-hero="v1"></div>
      <div class="popup-scroll-body" data-popup-scroll-body="v1" style="position: relative;">
        ${opts?.withRatings ? `<div data-popup-enrichment-rating="${locationId}" data-popup-ratings-block="v1">ratings</div>` : ''}
      </div>
      <div data-popup-footer="v1"></div>
    </div>
  `;
  return popupId;
}

function makeEvent(curationAction: string | undefined, locationId = fakeLocation.id) {
  return new CustomEvent('popup-action', {
    detail: { action: 'curation-primary', locationId, curationAction },
  }) as CustomEvent<any>;
}

function getHandler() {
  const { result } = renderHook(() =>
    usePopupActions({
      loadFromDatabase: vi.fn().mockResolvedValue(undefined),
      onOpenNotes: vi.fn(),
      onOpenPhotoUpload: vi.fn(),
    }),
  );
  return result.current.handlePopupAction;
}

beforeEach(() => {
  startMock.mockReset();
  clearLastResultMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastMessage.mockReset();
  toastLoading.mockReset();
  fakeLocation.customData = {};
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('P-POI-CURATION-2 — validate-geo', () => {
  it('launches a real geocoding job with mode=reconcile + locationIds + source', async () => {
    startMock.mockResolvedValue(undefined);
    const popupId = mountPopupDom(fakeLocation.id);
    const handler = getHandler();

    await handler(makeEvent('validate-geo'));

    expect(clearLastResultMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    const [total, scope] = startMock.mock.calls[0];
    expect(total).toBe(1);
    expect(scope.mode).toBe('reconcile');
    expect(scope.locationIds).toEqual([fakeLocation.id]);
    expect(scope.source).toBe('popup_validate_geo');
    expect(toastSuccess).toHaveBeenCalled();
    // Loading state cleared in finally
    expect(document.getElementById(popupId)?.getAttribute('data-popup-operational-state')).toBe('idle');
  });

  it('enters loading state with "Validando geografía…" label while job runs', async () => {
    const popupId = mountPopupDom(fakeLocation.id);
    let resolveJob: () => void;
    startMock.mockReturnValue(new Promise<void>((res) => { resolveJob = res; }));
    const handler = getHandler();

    const pending = handler(makeEvent('validate-geo'));
    // Give microtask a tick to set state
    await Promise.resolve();
    const root = document.getElementById(popupId)!;
    expect(root.getAttribute('data-popup-operational-state')).toBe('loading');
    const label = root.querySelector('.popup-operational-label')?.textContent ?? '';
    expect(label).toBe('Validando geografía…');

    resolveJob!();
    await pending;
    expect(root.getAttribute('data-popup-operational-state')).toBe('idle');
  });

  it('double-click does NOT duplicate the job (isPopupOperational guard)', async () => {
    mountPopupDom(fakeLocation.id);
    let resolveJob: () => void;
    startMock.mockReturnValue(new Promise<void>((res) => { resolveJob = res; }));
    const handler = getHandler();

    const first = handler(makeEvent('validate-geo'));
    await Promise.resolve();
    // Second click while still loading — must be ignored
    await handler(makeEvent('validate-geo'));
    expect(startMock).toHaveBeenCalledTimes(1);

    resolveJob!();
    await first;
  });

  it('error clears the loading state and shows error toast', async () => {
    const popupId = mountPopupDom(fakeLocation.id);
    startMock.mockRejectedValue(new Error('boom'));
    const handler = getHandler();

    await handler(makeEvent('validate-geo'));

    expect(toastError).toHaveBeenCalled();
    expect(document.getElementById(popupId)?.getAttribute('data-popup-operational-state')).toBe('idle');
  });
});

describe('P-POI-CURATION-2 — rate-experience', () => {
  it('focuses the ratings block when the POI is visited', async () => {
    fakeLocation.customData = { visited: 'true' };
    mountPopupDom(fakeLocation.id, { withRatings: true });
    const handler = getHandler();

    await handler(makeEvent('rate-experience'));

    const block = document.querySelector('[data-popup-ratings-block="v1"]')!;
    expect(block.getAttribute('data-popup-ratings-focus')).toBe('pulse');
    expect(toastMessage).not.toHaveBeenCalled();
  });

  it('prompts to mark as visited first when the POI is not visited', async () => {
    fakeLocation.customData = {};
    mountPopupDom(fakeLocation.id, { withRatings: true });
    const handler = getHandler();

    await handler(makeEvent('rate-experience'));

    expect(toastMessage).toHaveBeenCalledWith(
      expect.stringContaining('marca el POI como visitado'),
    );
  });

  it('still emits explicit toast when ratings block is absent (never silent)', async () => {
    fakeLocation.customData = {};
    mountPopupDom(fakeLocation.id, { withRatings: false });
    const handler = getHandler();

    await handler(makeEvent('rate-experience'));

    expect(toastMessage).toHaveBeenCalled();
  });
});

describe('P-POI-CURATION-2 — pending sub-actions never silent', () => {
  it.each([
    ['resolve-conflict', /Resolver conflicto/i],
    ['heal-poi', /Sanar POI/i],
  ])('%s emits explicit "pending" toast', async (sub, pattern) => {
    mountPopupDom(fakeLocation.id);
    const handler = getHandler();

    await handler(makeEvent(sub));

    expect(toastMessage).toHaveBeenCalledWith(expect.stringMatching(pattern));
    expect(startMock).not.toHaveBeenCalled();
  });

  it('unknown curationAction still emits a generic toast (never silent)', async () => {
    mountPopupDom(fakeLocation.id);
    const handler = getHandler();

    await handler(makeEvent('totally-unknown'));

    expect(toastMessage).toHaveBeenCalled();
  });
});
