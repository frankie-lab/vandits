/**
 * P-POPUP-9 — Territorial breadcrumb contract tests.
 *
 * - Orden canónico: country → region → zone → locality (global → local).
 * - Sin chips/background/border-radius en el header territorial.
 * - filter-link contract preservado para country/region/zone.
 * - Separador `›` aparece entre elementos (no al inicio ni final).
 * - Locality NO clickable (handler no soporta `locality`).
 * - Wrap natural (flex-wrap: wrap).
 */
import { describe, it, expect } from 'vitest';
import { buildTerritorialBreadcrumbHtml } from '@/shared/popup/geo-header';
import type { GeoLocation } from '@/types/location';

function loc(geo: Record<string, string>): GeoLocation {
  return {
    id: 't',
    name: 'T',
    coordinates: { lat: 0, lng: 0 },
    enrichedData: { datos_geograficos: geo },
  } as unknown as GeoLocation;
}

describe('P-POPUP-9 — buildTerritorialBreadcrumbHtml', () => {
  it('renderiza orden country → region → zone → locality', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      localidad: 'A Coruña',
      admin_nivel_2: 'A Coruña (provincia)',
      admin_nivel_1: 'Galicia',
      pais: 'España',
    }));
    const iCountry = html.indexOf('Spain');
    const iRegion = html.indexOf('Galicia');
    const iZone = html.indexOf('A Coruña (provincia)');
    const iLocality = html.indexOf('>A Coruña<');
    expect(iCountry).toBeGreaterThan(-1);
    expect(iRegion).toBeGreaterThan(iCountry);
    expect(iZone).toBeGreaterThan(iRegion);
    expect(iLocality).toBeGreaterThan(iZone);
  });

  it('emite filter-link para country/region/zone con data-filter-type correcto', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      localidad: 'Albarracín',
      admin_nivel_2: 'Teruel',
      admin_nivel_1: 'Aragón',
      pais: 'España',
    }));
    expect(html).toMatch(/class="filter-link[^"]*"[^>]*data-filter-type="country"[^>]*>Spain</);
    expect(html).toMatch(/class="filter-link[^"]*"[^>]*data-filter-type="region"[^>]*>Aragón</);
    expect(html).toMatch(/class="filter-link[^"]*"[^>]*data-filter-type="zone"[^>]*>Teruel</);
  });

  it('locality se renderiza como span no clickable', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      localidad: 'Albarracín',
      admin_nivel_1: 'Aragón',
      pais: 'España',
    }));
    expect(html).toMatch(/<span[^>]*data-geo-level="locality"[^>]*>Albarracín</);
    expect(html).not.toMatch(/filter-link[^>]*>Albarracín</);
  });

  it('separador › entre elementos pero NO al inicio ni al final', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      localidad: 'Madrid',
      admin_nivel_1: 'Comunidad de Madrid',
      pais: 'España',
    }));
    const seps = html.match(/popup-breadcrumb-sep/g) ?? [];
    // 3 chips → 2 separadores.
    expect(seps.length).toBe(2);
    // No empieza ni acaba con separador.
    const nav = html.match(/<nav[^>]*>(.*)<\/nav>/)?.[1] ?? '';
    expect(nav.startsWith('<span class="popup-breadcrumb-sep"')).toBe(false);
    expect(nav.endsWith('›</span>')).toBe(false);
  });

  it('SIN background hex/color de chip ni border-radius', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      localidad: 'A Coruña',
      admin_nivel_1: 'Galicia',
      pais: 'España',
    }));
    expect(html).not.toMatch(/background:\s*#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/background:\s*hsl\(var\(--secondary\)\)/);
    expect(html).not.toMatch(/border-radius/);
  });

  it('usa color muted y permite wrap', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({
      pais: 'España',
    }));
    expect(html).toContain('hsl(var(--muted-foreground))');
    expect(html).toContain('flex-wrap: wrap');
  });

  it('devuelve "" si no hay datos territoriales', () => {
    const empty = {
      id: 't', name: 'T', coordinates: { lat: 0, lng: 0 }, enrichedData: {},
    } as unknown as GeoLocation;
    expect(buildTerritorialBreadcrumbHtml(empty)).toBe('');
  });

  it('marca el contenedor con data-popup-geo-breadcrumb=1', () => {
    const html = buildTerritorialBreadcrumbHtml(loc({ pais: 'España' }));
    expect(html).toContain('data-popup-geo-breadcrumb="1"');
    expect(html).toContain('aria-label="Ubicación"');
  });
});
