/**
 * P-POI-CURATION-2.6 — Recovery mount margin regression.
 *
 * El wrapper de montaje de <UnenrichedRecoveryBlock> dentro del popup
 * (data-recovery-root) NO debe reintroducir los 16px laterales que
 * antes imponían un carril editorial sobre un bloque que es grid
 * interactivo (no prosa).
 *
 * Canon: margin lateral = 4px (libera ~24px de ancho útil real para
 * el inline NearbyPanel, que ya usa padX='px-0').
 *
 * Alcance cerrado: solo verifica el string canónico del mount en
 * `map-popups.ts`. No toca filas, NearbyPanel, lógica de curación,
 * niveles POI, shell ni variantes dialog/sidebar/card.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');
const source = readFileSync(SRC, 'utf8');

describe('P-POI-CURATION-2.6 — recovery mount margin', () => {
  it('data-recovery-root usa margin: 0 4px 8px 4px (canon 2.6)', () => {
    expect(source).toContain(
      'data-recovery-root="${location.id}" style="margin: 0 4px 8px 4px;"',
    );
  });

  it('no reintroduce los 16px laterales del mount (regresión 2.5→2.6)', () => {
    expect(source).not.toContain(
      'data-recovery-root="${location.id}" style="margin: 0 16px 8px 16px;"',
    );
  });
});
