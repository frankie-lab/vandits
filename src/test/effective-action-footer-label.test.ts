/**
 * buildFooterLabel — contract test.
 *
 * Cubre: all, debt, unenriched, selección, scopeLabel.
 * Plan: docs/audits/search-filter-maintain-tree-universe-plan.md §5.
 */
import { describe, it, expect } from 'vitest';
import { buildFooterLabel, buildExportLabel } from '@/components/filters/footer-label';

describe('buildFooterLabel', () => {
  it('mode=all sin selección y sin scope', () => {
    expect(
      buildFooterLabel({ mode: 'all', count: 42, hasUserSelection: false }),
    ).toBe('Acciones sobre 42 POIs');
  });

  it('mode=debt sin selección', () => {
    expect(
      buildFooterLabel({ mode: 'debt', count: 13, hasUserSelection: false }),
    ).toBe('Acciones sobre 13 POIs con deuda');
  });

  it('mode=unenriched sin selección', () => {
    expect(
      buildFooterLabel({ mode: 'unenriched', count: 240, hasUserSelection: false }),
    ).toBe('Acciones sobre 240 POIs sin enriquecer');
  });

  it('mode=debt con scopeLabel', () => {
    expect(
      buildFooterLabel({
        mode: 'debt',
        count: 5,
        hasUserSelection: false,
        scopeLabel: 'Europe',
      }),
    ).toBe('Acciones sobre 5 POIs con deuda en Europe');
  });

  it('mode=unenriched con scopeLabel', () => {
    expect(
      buildFooterLabel({
        mode: 'unenriched',
        count: 240,
        hasUserSelection: false,
        scopeLabel: 'France',
      }),
    ).toBe('Acciones sobre 240 POIs sin enriquecer en France');
  });

  it('selección manual usa "seleccionados" en cualquier modo', () => {
    for (const mode of ['all', 'debt', 'unenriched'] as const) {
      expect(
        buildFooterLabel({ mode, count: 7, hasUserSelection: true }),
      ).toBe('Acciones sobre 7 seleccionados');
    }
  });

  it('selección manual + scopeLabel', () => {
    expect(
      buildFooterLabel({
        mode: 'all',
        count: 3,
        hasUserSelection: true,
        scopeLabel: 'Italy',
      }),
    ).toBe('Acciones sobre 3 seleccionados en Italy');
  });
});

describe('buildExportLabel', () => {
  it('selección → "Selección actual"', () => {
    expect(buildExportLabel({ mode: 'all', hasUserSelection: true })).toBe(
      'Selección actual',
    );
  });

  it('all sin scope → "Explorar"', () => {
    expect(buildExportLabel({ mode: 'all', hasUserSelection: false })).toBe('Explorar');
  });

  it('all + scope → "Explorar · Europe"', () => {
    expect(
      buildExportLabel({ mode: 'all', hasUserSelection: false, scopeLabel: 'Europe' }),
    ).toBe('Explorar · Europe');
  });

  it('debt + scope → "Con deuda · Europe"', () => {
    expect(
      buildExportLabel({ mode: 'debt', hasUserSelection: false, scopeLabel: 'Europe' }),
    ).toBe('Con deuda · Europe');
  });

  it('unenriched + scope → "Sin enriquecer · France"', () => {
    expect(
      buildExportLabel({
        mode: 'unenriched',
        hasUserSelection: false,
        scopeLabel: 'France',
      }),
    ).toBe('Sin enriquecer · France');
  });
});
