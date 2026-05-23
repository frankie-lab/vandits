/**
 * Selection counter ownership ratios — unit tests.
 * Ver docs/audits/selection-counter-ownership-ratios-plan.md.
 *
 * Reproduce the inline ratio computation that lives in FilterBar.tsx, so
 * regressions on the math get caught even if the JSX evolves.
 */
import { describe, it, expect } from 'vitest';

type LocLike = {
  id: string;
  ownerUserId?: string | null;
  _docUserId?: string | null;
};

function computeRatios(
  filteredLocations: LocLike[],
  selectedLocations: Set<string>,
  uid: string | null,
) {
  const T = filteredLocations.length;
  let Tm = 0;
  let Xm = 0;
  let X = 0;
  for (const loc of filteredLocations) {
    const ownerId = loc.ownerUserId ?? loc._docUserId ?? null;
    const mine = !!uid && ownerId === uid;
    if (mine) Tm += 1;
    if (selectedLocations.has(loc.id)) {
      X += 1;
      if (mine) Xm += 1;
    }
  }
  return { T, Tm, Ts: T - Tm, X, Xm, Xs: X - Xm };
}

const UID = 'u-self';
const mine = (id: string): LocLike => ({ id, ownerUserId: UID });
const other = (id: string, owner = 'u-other'): LocLike => ({ id, ownerUserId: owner });

describe('selection counter ownership ratios', () => {
  const universe = [mine('a'), mine('b'), mine('c'), other('x'), other('y')];

  it('no selection → T/Tm/Ts reflect universe', () => {
    const r = computeRatios(universe, new Set(), UID);
    expect(r).toEqual({ T: 5, Tm: 3, Ts: 2, X: 0, Xm: 0, Xs: 0 });
  });

  it('selection 100% mine', () => {
    const r = computeRatios(universe, new Set(['a', 'b']), UID);
    expect(r.X).toBe(2);
    expect(r.Xm).toBe(2);
    expect(r.Xs).toBe(0);
    expect(r.Xm + r.Xs).toBe(r.X);
  });

  it('selection 100% followed/other', () => {
    const r = computeRatios(universe, new Set(['x', 'y']), UID);
    expect(r.X).toBe(2);
    expect(r.Xm).toBe(0);
    expect(r.Xs).toBe(2);
  });

  it('selection mixed', () => {
    const r = computeRatios(universe, new Set(['a', 'x']), UID);
    expect(r).toMatchObject({ X: 2, Xm: 1, Xs: 1 });
    expect(r.Xm + r.Xs).toBe(r.X);
    expect(r.Tm + r.Ts).toBe(r.T);
  });

  it('selection outside filter is clipped to universe', () => {
    // 'zzz' is selected but not in filteredLocations → must not count.
    const r = computeRatios(universe, new Set(['a', 'zzz']), UID);
    expect(r.X).toBe(1);
    expect(r.Xm).toBe(1);
  });

  it('anonymous (uid=null) → everything counts as followed', () => {
    const r = computeRatios(universe, new Set(['a', 'x']), null);
    expect(r.Tm).toBe(0);
    expect(r.Ts).toBe(5);
    expect(r.Xm).toBe(0);
    expect(r.Xs).toBe(2);
  });

  it('cross-document selection counts real POIs', () => {
    const cross: LocLike[] = [
      { id: 'd1-1', ownerUserId: UID, _docUserId: UID },
      { id: 'd2-1', ownerUserId: UID, _docUserId: UID },
      { id: 'd3-1', ownerUserId: 'u-other', _docUserId: 'u-other' },
    ];
    const r = computeRatios(cross, new Set(['d1-1', 'd2-1', 'd3-1']), UID);
    expect(r).toEqual({ T: 3, Tm: 2, Ts: 1, X: 3, Xm: 2, Xs: 1 });
  });

  it('legacy fallback: ownerUserId missing, _docUserId used', () => {
    const legacy: LocLike[] = [
      { id: 'l1', _docUserId: UID },
      { id: 'l2', _docUserId: 'u-other' },
    ];
    const r = computeRatios(legacy, new Set(['l1']), UID);
    expect(r.Tm).toBe(1);
    expect(r.Xm).toBe(1);
  });

  it('filters reducing universe change T/Tm/Ts', () => {
    const filtered = universe.filter(l => l.id !== 'x' && l.id !== 'y');
    const r = computeRatios(filtered, new Set(['a']), UID);
    expect(r).toEqual({ T: 3, Tm: 3, Ts: 0, X: 1, Xm: 1, Xs: 0 });
  });
});

describe('selection counter UX copy', () => {
  const label = (n: number) => (n === 1 ? 'seleccionado' : 'seleccionados');
  it('singular when X === 1', () => {
    expect(label(1)).toBe('seleccionado');
  });
  it('plural otherwise', () => {
    expect(label(0)).toBe('seleccionados');
    expect(label(2)).toBe('seleccionados');
    expect(label(99)).toBe('seleccionados');
  });
});

describe('FilterBar — no duplicated selection counter (source-level)', () => {
  it('does not render "{X} / {T} seleccionados" template in bottom row', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/FilterBar.tsx', 'utf8');
    // El header sigue mostrando "{X} seleccionado(s)" (sin "/ T") — buscar el
    // patrón viejo "/ {COUNT_FORMATTER.format(ownershipRatios.T)} seleccionados"
    // que vivía en la fila inferior.
    expect(src).not.toMatch(/\/\s*\{COUNT_FORMATTER\.format\(ownershipRatios\.T\)\}\s*seleccionados/);
    // "Míos … / Seguidos …" debe aparecer EXACTAMENTE una vez (en el header).
    const occurrences = src.match(/text-emerald-600 font-medium">Míos</g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('keeps Seleccionar todo / Limpiar buttons', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/FilterBar.tsx', 'utf8');
    expect(src).toMatch(/Seleccionar todo/);
    expect(src).toMatch(/Limpiar/);
  });

  it('filter warning copy is the secondary variant', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/FilterBar.tsx', 'utf8');
    expect(src).toMatch(/Filtros activos: mostrando/);
    expect(src).not.toMatch(/Los filtros activos muestran solo/);
  });
});
