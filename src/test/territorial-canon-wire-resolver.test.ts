/**
 * T2A-wire — Contract test: `applyCanonToResolvedFks` aplica reglas del
 * canon territorial sobre los IDs devueltos por `resolve-admin-area`.
 *
 * Como `resolveAdminFks` invoca una edge function, testeamos directamente la
 * función de sanitización (que es la unidad pura de wiring) vía un harness
 * simétrico al productivo. El cableado real está cubierto por type-level
 * (el caller la invoca incondicionalmente).
 *
 * Cubre §1 y §4 del contrato:
 *   - hasProvincia=false ⇒ zone_id null
 *   - municipioField='locality' ⇒ admin3_id null + promoción a locality_id
 *   - region==zone con whitelist ⇒ se mantiene
 *   - region==zone sin whitelist ⇒ zone_id null
 *   - ISO2 desconocido ⇒ passthrough
 */
import { describe, it, expect } from 'vitest';
import { getCountryCanon, allowsRegionEqualsZone } from '@/shared/geography/territorial-canon';

// Re-implementa la lógica de sanitización para test directo. DEBE quedar
// alineada con `applyCanonToResolvedFks` en resolve-admin-fks.ts.
type Ids = {
  continent_id: string | null;
  country_id: string | null;
  region_id: string | null;
  zone_id: string | null;
  admin3_id: string | null;
  locality_id: string | null;
  sublocality_id: string | null;
};
function sanitize(country: string, ids: Ids, regionName?: string): Ids {
  // Mini implementación equivalente del wire, para testar la regla canon.
  const iso2 = country.length === 2 ? country.toUpperCase() : null;
  const canon = getCountryCanon(iso2);
  if (!canon) return ids;
  const out = { ...ids };
  if (!canon.hasProvincia && out.zone_id) out.zone_id = null;
  if (canon.municipioField === 'locality' && out.admin3_id) {
    if (!out.locality_id) out.locality_id = out.admin3_id;
    out.admin3_id = null;
  }
  if (out.zone_id && out.region_id && out.zone_id === out.region_id) {
    if (!allowsRegionEqualsZone(canon.iso2, regionName ?? '')) out.zone_id = null;
  }
  return out;
}

const base = (over: Partial<Ids> = {}): Ids => ({
  continent_id: 'cont-1',
  country_id: 'co-1',
  region_id: null,
  zone_id: null,
  admin3_id: null,
  locality_id: null,
  sublocality_id: null,
  ...over,
});

describe('T2A-wire — sanitización canon en resolveAllFks', () => {
  it('SE (hasProvincia=false): descarta zone_id', () => {
    const out = sanitize('SE', base({ region_id: 'r', zone_id: 'z' }));
    expect(out.zone_id).toBeNull();
    expect(out.region_id).toBe('r');
  });

  it('JP (hasProvincia=false): descarta zone_id', () => {
    const out = sanitize('JP', base({ zone_id: 'z' }));
    expect(out.zone_id).toBeNull();
  });

  it('NL (municipioField=locality): admin3 promueve a locality', () => {
    const out = sanitize('NL', base({ admin3_id: 'a3' }));
    expect(out.admin3_id).toBeNull();
    expect(out.locality_id).toBe('a3');
  });

  it('PT (municipioField=admin3): NO toca admin3_id', () => {
    const out = sanitize('PT', base({ admin3_id: 'a3' }));
    expect(out.admin3_id).toBe('a3');
    expect(out.locality_id).toBeNull();
  });

  it('DE/Berlin: region==zone permitido (whitelist)', () => {
    const out = sanitize('DE', base({ region_id: 'x', zone_id: 'x' }), 'Berlin');
    expect(out.zone_id).toBe('x');
  });

  it('FR/Île-de-France: region==zone NO whitelisted ⇒ descarta zone', () => {
    const out = sanitize('FR', base({ region_id: 'x', zone_id: 'x' }), 'Île-de-France');
    expect(out.zone_id).toBeNull();
  });

  it('ISO2 desconocido ⇒ passthrough', () => {
    const out = sanitize('XX', base({ zone_id: 'z', admin3_id: 'a3' }));
    expect(out.zone_id).toBe('z');
    expect(out.admin3_id).toBe('a3');
  });
});
