// PR-BOOT-PERF-2 — Contract test for concurrent catalog pagination.
//
// Asegura el contrato establecido por
// `docs/audits/boot-performance-after-pr2.md`:
//
//   1. Cuando `withCount: true` y el HEAD count devuelve N>0, la
//      paginación lanza páginas en PARALELO con concurrencia ≤
//      `CATALOG_PAGE_CONCURRENCY` (=3). Nunca se observan >3 fetches
//      in-flight simultáneamente.
//   2. El orden final del array es estable: se mantiene el orden por
//      índice de página independientemente del orden de respuesta.
//   3. Cuando `withCount: false` (o el HEAD falla), el camino secuencial
//      legacy sigue activo (probe hasta página vacía).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock supabase BEFORE importing the module under test.
const fetchCalls: Array<{ from: number; to: number; startedAt: number; resolvedAt?: number }> = [];
let inFlight = 0;
let peakInFlight = 0;
let countMock: number | null = 1000;
let staggeredResolveMs: ((idx: number) => number) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const make = () => {
    const builder: any = {
      _isHead: false,
      _isCount: false,
      _from: 0,
      _to: 0,
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) this._isHead = true;
        return this;
      },
      is() { return this; },
      order() { return this; },
      range(from: number, to: number) {
        this._from = from;
        this._to = to;
        return this.then ? this : this._exec();
      },
      _exec() {
        // .range returns a thenable — but we need to start the fetch on await.
        const self = this;
        return {
          then(resolve: (v: any) => void) {
            const startedAt = performance.now();
            const idx = Math.floor(self._from / 1000);
            inFlight++;
            peakInFlight = Math.max(peakInFlight, inFlight);
            fetchCalls.push({ from: self._from, to: self._to, startedAt });
            const delay = staggeredResolveMs ? staggeredResolveMs(idx) : 10;
            setTimeout(() => {
              inFlight--;
              // Simulate `total` rows split into pages of 1000.
              const total = countMock ?? 0;
              const start = self._from;
              const end = Math.min(self._to + 1, total);
              const rows = [];
              for (let i = start; i < end; i++) {
                rows.push({ id: `loc-${i}`, idx: i });
              }
              fetchCalls[fetchCalls.length - 1].resolvedAt = performance.now();
              resolve({ data: rows, error: null });
            }, delay);
          },
        };
      },
    };
    return builder;
  };

  return {
    supabase: {
      from(_table: string) {
        const b: any = make();
        // Head/count branch
        b.select = function (cols: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) {
            return {
              is() {
                return Promise.resolve({ count: countMock, error: null });
              },
            };
          }
          return b;
        };
        b.is = function () { return b; };
        b.order = function () { return b; };
        b.range = function (from: number, to: number) {
          b._from = from; b._to = to;
          return b._exec();
        };
        return b;
      },
    },
  };
});

import { fetchAllLocationsPaginated, CATALOG_PAGE_CONCURRENCY } from '@/domains/content/lib/db-transformers';

function reset() {
  fetchCalls.length = 0;
  inFlight = 0;
  peakInFlight = 0;
  staggeredResolveMs = null;
}

describe('catalog pagination contract (PR-BOOT-PERF-2)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('exports a hard concurrency cap of 3', () => {
    expect(CATALOG_PAGE_CONCURRENCY).toBe(3);
  });

  it('runs pages in parallel with peak in-flight ≤ CATALOG_PAGE_CONCURRENCY when total is known', async () => {
    countMock = 5100; // 6 pages of 1000
    // Stagger so we can actually observe parallelism.
    staggeredResolveMs = (idx) => 20 + (idx % 3) * 5;

    const rows = await fetchAllLocationsPaginated({ withCount: true });

    expect(rows.length).toBe(5100);
    expect(fetchCalls.length).toBe(6);
    expect(peakInFlight).toBeGreaterThan(1); // truly parallel
    expect(peakInFlight).toBeLessThanOrEqual(CATALOG_PAGE_CONCURRENCY);
  });

  it('preserves stable order by page index regardless of resolution order', async () => {
    countMock = 5100;
    // Resolve later-index pages FIRST (reverse), to prove ordering is by index.
    staggeredResolveMs = (idx) => 100 - idx * 10;

    const rows = await fetchAllLocationsPaginated({ withCount: true });

    expect(rows.length).toBe(5100);
    expect(rows[0].id).toBe('loc-0');
    expect(rows[999].id).toBe('loc-999');
    expect(rows[1000].id).toBe('loc-1000');
    expect(rows[5099].id).toBe('loc-5099');
    // Strict monotonic on `idx`
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].idx).toBe(rows[i - 1].idx + 1);
    }
  });

  it('falls back to sequential probe when total is unknown', async () => {
    countMock = 2500; // 3 pages
    staggeredResolveMs = () => 5;

    const rows = await fetchAllLocationsPaginated({ withCount: false });

    expect(rows.length).toBe(2500);
    // Sequential ⇒ never more than 1 in-flight at a time.
    expect(peakInFlight).toBe(1);
    // 3 data pages + 1 empty probe (returned=0 ⇒ stop)
    expect(fetchCalls.length).toBe(4);
  });
});
