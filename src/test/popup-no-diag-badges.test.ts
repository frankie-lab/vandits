/**
 * P-POPUP-15 — Los badges debug `P-POPUP-2 ON` / `P-POPUP-3 ON` están
 * retirados del runtime: nunca aparecen en preview, ?diag=1, ni producción.
 * Los atributos `data-popup-*` del root se preservan como hooks de test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeoLocation } from '@/types/location';

vi.mock('@/domains/content/lib/nearby-popup-context', () => ({
  isNearbyPopupContext: () => false,
}));

vi.mock('@/domains/content/lib/personal-tags-filter', () => ({
  filterPersonalTags: (_id: string, tags: string[] | undefined) => tags ?? [],
}));

import { createPopupContent } from '@/components/map/map-popups';

function poi(): GeoLocation {
  return {
    id: 'p1',
    name: 'Test POI',
    coordinates: { lat: 0, lng: 0 },
    customData: {},
    enrichedData: { descripcion: 'Una descripción enriquecida válida.' },
  } as unknown as GeoLocation;
}

describe('P-POPUP-15 — sin badges debug en runtime', () => {
  const origLocation = window.location;

  function setHostname(host: string, search = '') {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...origLocation, hostname: host, search },
    });
  }

  beforeEach(() => {
    // limpio
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: origLocation,
    });
  });

  for (const host of ['preview.lovable.app', 'localhost', '127.0.0.1', 'vandits.app']) {
    it(`hostname=${host}: HTML del popup no contiene los badges`, () => {
      setHostname(host);
      const html = createPopupContent(poi());
      expect(html).not.toContain('>P-POPUP-2 ON<');
      expect(html).not.toContain('>P-POPUP-3 ON<');
    });
  }

  it('?diag=1 tampoco reintroduce los badges', () => {
    setHostname('vandits.app', '?diag=1');
    const html = createPopupContent(poi());
    expect(html).not.toContain('>P-POPUP-2 ON<');
    expect(html).not.toContain('>P-POPUP-3 ON<');
  });

  it('data-popup-* hooks de test permanecen en el root', () => {
    setHostname('vandits.app');
    const html = createPopupContent(poi());
    expect(html).toMatch(/data-popup-version=/);
    expect(html).toMatch(/data-popup-geo-canonical=/);
    expect(html).toMatch(/data-popup-ownership-strip=/);
  });
});
