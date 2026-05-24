/**
 * T2A-wire §1.b — Contract test edge:
 *
 *  1. Paridad runtime TS↔Deno de `regionHasNoProvincia` para PT-20/PT-30/PT-11
 *     (canon mirror).
 *  2. Wiring: `supabase/functions/resolve-admin-area/index.ts` importa y usa
 *     `regionHasNoProvincia` desde `_shared/territorial-canon.ts`, devuelve
 *     `meta.region_iso_code` y emite `canon-region-zone-forbidden`.
 *  3. Wiring cliente: `src/shared/geography/resolve-admin-fks.ts` consume
 *     `meta.region_iso_code` y aplica el veto.
 *
 * Sin acceso a runtime Deno aquí — el test verifica el contrato vía fuente
 * (helper paritate ya cubierto por canon-parity) + presencia de wiring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { regionHasNoProvincia as tsHelper } from '@/shared/geography/territorial-canon';
import { regionHasNoProvincia as denoHelper } from '../../supabase/functions/_shared/territorial-canon';

const EDGE = 'supabase/functions/resolve-admin-area/index.ts';
const CLIENT = 'src/shared/geography/resolve-admin-fks.ts';

const readFile = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf-8');

describe('T2A-wire §1.b — edge enforcement (resolve-admin-area)', () => {
  describe('paridad runtime regionHasNoProvincia', () => {
    const cases: Array<[string, string, boolean]> = [
      ['PT', 'PT-20', true],
      ['PT', 'PT-30', true],
      ['PT', 'PT-11', false],
      ['PT', 'PT-01', false],
      ['ES', 'ES-CN', false],
      ['XX', 'PT-20', false],
    ];
    for (const [iso2, regionIso, expected] of cases) {
      it(`${iso2}/${regionIso} ⇒ ${expected} (TS == Deno)`, () => {
        expect(tsHelper(iso2, regionIso)).toBe(expected);
        expect(denoHelper(iso2, regionIso)).toBe(expected);
      });
    }
  });

  describe('wiring edge function', () => {
    const src = readFile(EDGE);
    it('importa regionHasNoProvincia desde _shared/territorial-canon', () => {
      expect(src).toMatch(/from\s+['"]\.\.\/_shared\/territorial-canon\.ts['"]/);
      expect(src).toMatch(/regionHasNoProvincia/);
    });
    it('emite warning canónico canon-region-zone-forbidden', () => {
      expect(src).toMatch(/canon-region-zone-forbidden/);
    });
    it('devuelve meta.region_iso_code en respuesta', () => {
      expect(src).toMatch(/region_iso_code/);
      expect(src).toMatch(/regionForbidsProvincia/);
    });
    it('descarta zone_id en el bloque del veto', () => {
      // Verificamos que el bloque incluye asignación zone_id=null cerca de regionHasNoProvincia.
      const idx = src.indexOf('regionHasNoProvincia');
      expect(idx).toBeGreaterThan(0);
      const window = src.slice(idx, idx + 600);
      expect(window).toMatch(/ids\[['"]zone_id['"]\]\s*=\s*null/);
    });
  });

  describe('wiring cliente resolveAllFks', () => {
    const src = readFile(CLIENT);
    it('importa regionHasNoProvincia del canon TS', () => {
      expect(src).toMatch(/regionHasNoProvincia/);
    });
    it('consume meta.region_iso_code del payload edge', () => {
      expect(src).toMatch(/region_iso_code/);
      expect(src).toMatch(/data\?\.meta/);
    });
    it('aplica defensa en profundidad (out.zone_id = null)', () => {
      const idx = src.indexOf('regionHasNoProvincia(canon.iso2, regionIsoCode)');
      expect(idx).toBeGreaterThan(0);
      const window = src.slice(idx, idx + 300);
      expect(window).toMatch(/out\.zone_id\s*=\s*null/);
    });
    it('emite warning canónico canon-region-zone-forbidden', () => {
      expect(src).toMatch(/canon-region-zone-forbidden/);
    });
  });
});
