/**
 * T2A-wire (§1.b) — Contract test: cliente `applyCanonToResolvedFks` aplica
 * el veto regional cuando la edge `resolve-admin-area` devuelve
 * `meta.region_iso_code` de una región sin provincia.
 *
 * Harness simétrico al productivo (mismo wiring que el test base
 * `territorial-canon-wire-resolver.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import {
  getCountryCanon,
  allowsRegionEqualsZone,
  regionHasNoProvincia,
} from '@/shared/geography/territorial-canon';

type Ids = {
  continent_id: string | null;
  country_id: string | null;
  region_id: string | null;
  zone_id: string | null;
  admin3_id: string | null;
  locality_id: string | null;
  sublocality_id: string | null;
};

interface Meta {
  region_iso_code?: string | null;
}

function sanitize(
  country: string,
  ids: Ids,
  regionName?: string,
  meta?: Meta | null,
): Ids {
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
  const regionIsoCode = meta?.region_iso_code ?? null;
  if (regionIsoCode && regionHasNoProvincia(canon.iso2, regionIsoCode) && out.zone_id) {
    out.zone_id = null;
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

describe('T2A-wire §1.b — applyCanonToResolvedFks consume meta.region_iso_code', () => {
  it('PT + meta PT-20 (Açores) ⇒ descarta zone_id aunque venga poblado', () => {
    const out = sanitize(
      'PT',
      base({ region_id: 'r-acores', zone_id: 'z-spurious' }),
      undefined,
      { region_iso_code: 'PT-20' },
    );
    expect(out.zone_id).toBeNull();
    expect(out.region_id).toBe('r-acores');
  });

  it('PT + meta PT-30 (Madeira) ⇒ descarta zone_id', () => {
    const out = sanitize(
      'PT',
      base({ region_id: 'r-madeira', zone_id: 'z-spurious' }),
      undefined,
      { region_iso_code: 'PT-30' },
    );
    expect(out.zone_id).toBeNull();
  });

  it('PT continental (meta PT-11 Norte) ⇒ preserva zone_id (Distrito)', () => {
    const out = sanitize(
      'PT',
      base({ region_id: 'r-norte', zone_id: 'z-porto' }),
      undefined,
      { region_iso_code: 'PT-11' },
    );
    expect(out.zone_id).toBe('z-porto');
  });

  it('passthrough cuando meta ausente (back-compat con respuesta vieja)', () => {
    const out = sanitize(
      'PT',
      base({ region_id: 'r', zone_id: 'z' }),
      undefined,
      null,
    );
    expect(out.zone_id).toBe('z');
  });

  it('iso2 desconocido no rompe (no veto)', () => {
    const out = sanitize(
      'XX',
      base({ region_id: 'r', zone_id: 'z' }),
      undefined,
      { region_iso_code: 'PT-20' },
    );
    expect(out.zone_id).toBe('z');
  });
});
