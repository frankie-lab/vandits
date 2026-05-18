/**
 * P-POI-CURATION-2.7 — Buscador manual inline en el bloque Contexto cercano.
 *
 * Garantías cubiertas por estos tests source-level (sin remount real):
 *  1. El header inline del NearbyPanel renderiza un input de búsqueda
 *     visible cuando no hay loading ni error (data-nearby-search-input).
 *  2. El modo búsqueda se activa con debouncedQuery.length >= 2 y
 *     reemplaza el grouping por una lista plana etiquetada
 *     (data-nearby-mode + data-nearby-search-results).
 *  3. La transición no introduce caja extra (sin bg-muted en el wrapper
 *     del input, sin border, sin rounded).
 *  4. El estado vacío de búsqueda tiene su propio marker
 *     (data-nearby-search-empty="1") con mensaje legible.
 *
 * Alcance cerrado: no toca lógica de curación, niveles POI, shell, ni
 * variantes dialog/sidebar/card.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(__dirname, '../domains/content/components/PointContextActions.tsx');
const SRC = readFileSync(FILE, 'utf-8');

describe('P-POI-CURATION-2.7 — manual search inline', () => {
  it('NearbyPanel inline header renders search input with data-nearby-search-input hook', () => {
    expect(SRC).toContain('data-nearby-search-input');
    expect(SRC).toContain('placeholder="Buscar por nombre');
    expect(SRC).toContain('!loadingNearby && !errorNearby');
  });

  it('searchQuery state exists with debounced mirror and 300ms timer', () => {
    expect(SRC).toMatch(/const\s+\[searchQuery,\s*setSearchQuery\]\s*=\s*useState\(''\)/);
    expect(SRC).toMatch(/const\s+\[debouncedQuery,\s*setDebouncedQuery\]/);
    expect(SRC).toMatch(/setTimeout\(\(\)\s*=>\s*setDebouncedQuery\(searchQuery\.trim\(\)\),\s*300\)/);
  });

  it('search mode is gated by debouncedQuery.length >= 2', () => {
    expect(SRC).toMatch(/isSearchMode\s*=\s*debouncedQuery\.length\s*>=\s*2/);
  });

  it('results region exposes data-nearby-mode auto|search and data-nearby-search-results in search mode', () => {
    expect(SRC).toContain("data-nearby-mode={isSearchMode ? 'search' : 'auto'}");
    expect(SRC).toContain("'data-nearby-search-results': '1'");
  });

  it('search empty state has its own marker and humane message', () => {
    expect(SRC).toContain('data-nearby-search-empty="1"');
    expect(SRC).toMatch(/Sin resultados para/);
  });

  it('clear button (×) is present when query is non-empty', () => {
    expect(SRC).toContain('data-nearby-search-clear');
    expect(SRC).toMatch(/onClick=\{\(\) => setSearchQuery\(''\)\}/);
  });

  it('search input wrapper stays flat: no bg-muted, no rounded-lg, no border on the input row', () => {
    // Extract the search input block.
    const m = SRC.match(/data-nearby-search-input[\s\S]{0,1200}?<\/div>/);
    expect(m, 'search input block not found').toBeTruthy();
    const block = m![0];
    expect(block).not.toMatch(/\bbg-muted\b/);
    expect(block).not.toMatch(/\brounded-lg\b/);
    // Allowed: a thin border-b on the input itself (underline affordance), but
    // not a full box-border on the wrapper.
    expect(block).not.toMatch(/border\s+border-border\b/);
  });

  it('reset al cambiar de POI: searchQuery vuelve a vacío en el efecto de location.id', () => {
    expect(SRC).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setSearchQuery\(''\);\s*setDebouncedQuery\(''\);\s*\},\s*\[location\.id\]\)/);
  });

  it('cap inicial se desactiva en modo búsqueda (resultados ya acotados por la query)', () => {
    expect(SRC).toMatch(/cap\s*=\s*\(isInline\s*&&\s*!expandedList\s*&&\s*!isSearchMode\)/);
  });
});
