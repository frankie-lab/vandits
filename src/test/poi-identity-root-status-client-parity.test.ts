/**
 * Contract test — Paridad cliente ↔ Deno del clasificador Root Status A/B/C/D.
 *
 * Bloquea drift entre:
 *   - `supabase/functions/_shared/poi-identity-root-status.ts` (SoT Deno)
 *   - `src/domains/content/lib/poi-identity-root-status-client.ts` (espejo cliente)
 *
 * Las fixtures compartidas viven en
 *   `src/test/fixtures/poi-identity-root-status.fixtures.json`
 * y deben actualizarse en el mismo PR que cualquier cambio en cualquiera
 * de los dos clasificadores. CI falla si el espejo cliente devuelve un
 * veredicto distinto al esperado.
 *
 * Ver `docs/audits/search-filter-root-status-filter-plan.md` §5.1 e I5.
 */
import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/poi-identity-root-status.fixtures.json';
import {
  classifyPoiIdentityRootStatusClient,
  type LocationRow,
} from '@/domains/content/lib/poi-identity-root-status-client';

type Case = {
  name: string;
  row: LocationRow;
  expected: {
    root: 'A' | 'B' | 'C' | 'D';
    eligibleForAutoEnrich: boolean;
    skipReason?: string;
  };
};

const CASES: Case[] = (fixtures as { cases: Case[] }).cases;

describe('classifyPoiIdentityRootStatusClient · paridad con Deno', () => {
  it('todas las fixtures producen el veredicto esperado', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(21);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const got = classifyPoiIdentityRootStatusClient(c.row);
      expect(got.root).toBe(c.expected.root);
      expect(got.eligibleForAutoEnrich).toBe(c.expected.eligibleForAutoEnrich);
      if (c.expected.skipReason !== undefined) {
        expect(got.skipReason).toBe(c.expected.skipReason);
      } else {
        expect(got.skipReason).toBeUndefined();
      }
    });
  }
});
