/**
 * P-POI-CURATION-2.12 — Canon de la fila seleccionada en Contexto cercano.
 *
 * Reglas verificadas:
 *  - Helper único `canReplaceCurrentPoi`:
 *      enriched + sin mismatch          → false
 *      no enriched + sin mismatch       → true
 *      cualquier estado + mismatch      → true
 *      null/undefined                   → false
 *  - El bloque de fila seleccionada en `PointContextActions.tsx` NO contiene
 *    los dos checkboxes paralelos (`Reemplazar importado` / `Punto personal`)
 *    ni `<input type="checkbox">` dentro del slot interactivo.
 *  - Renderiza CTAs canónicos:
 *      "Usar como este punto"             (primaria replace)
 *      "Guardar como punto personal"      (primaria personal)
 *      "Guardar también como punto personal" (secundaria, link)
 *      "Reemplazar y guardar personal"    (CTA combinado)
 *  - Estados de control `wantReplace` / `wantPersonal` ELIMINADOS.
 *
 * Alcance cerrado: assertions estructurales sobre el código fuente. No toca
 * lógica de adopción ni renderiza el árbol React (otros tests cubren mount).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canReplaceCurrentPoi } from '@/domains/content/lib/can-replace-current-poi';

const COMPONENT_SRC = readFileSync(
  resolve(__dirname, '../domains/content/components/PointContextActions.tsx'),
  'utf8',
);

describe('canReplaceCurrentPoi — helper único', () => {
  it('null/undefined → false', () => {
    expect(canReplaceCurrentPoi(null)).toBe(false);
    expect(canReplaceCurrentPoi(undefined)).toBe(false);
  });

  it('POI enriquecido (con enriched_data.descripcion) sin mismatch → false', () => {
    const loc = {
      enriched_data: { descripcion: 'Texto generado por IA.' },
      description: 'Texto generado por IA.',
    };
    expect(canReplaceCurrentPoi(loc)).toBe(false);
  });

  it('POI NO enriquecido sin mismatch → true', () => {
    expect(canReplaceCurrentPoi({ enriched_data: null, description: null })).toBe(true);
    expect(canReplaceCurrentPoi({ enriched_data: {}, description: 'importado crudo' })).toBe(true);
  });

  it('mismatch presente → true incluso si el POI está enriquecido', () => {
    const loc = {
      enriched_data: { descripcion: 'OK' },
      description: 'OK',
    };
    expect(canReplaceCurrentPoi(loc, { mismatch: { providedName: 'X' } })).toBe(true);
  });
});

describe('PointContextActions — fila seleccionada (canon 2.12)', () => {
  it('NO contiene los dos checkboxes paralelos (labels prohibidos)', () => {
    expect(COMPONENT_SRC).not.toContain('<span>Reemplazar importado</span>');
    expect(COMPONENT_SRC).not.toContain('<span>Punto personal</span>');
  });

  it('NO usa <input type="checkbox"> dentro del slot interactivo de la fila', () => {
    // Buscar entre el marcador estable de la fila seleccionada y el cierre
    // de su contenedor. Sustituido por el marcador del slot canónico.
    const start = COMPONENT_SRC.indexOf('data-selected-row-actions="v1"');
    expect(start).toBeGreaterThan(-1);
    const slice = COMPONENT_SRC.slice(start, start + 4000);
    expect(slice).not.toContain('type="checkbox"');
  });

  it('estados `wantReplace` y `wantPersonal` eliminados del componente', () => {
    expect(COMPONENT_SRC).not.toContain('setWantReplace');
    expect(COMPONENT_SRC).not.toContain('setWantPersonal');
    expect(COMPONENT_SRC).not.toMatch(/\bwantReplace\b/);
    expect(COMPONENT_SRC).not.toMatch(/\bwantPersonal\b/);
  });

  it('renderiza el slot interactivo canónico con marcador estable', () => {
    expect(COMPONENT_SRC).toContain('data-selected-row-actions="v1"');
    expect(COMPONENT_SRC).toContain('data-selected-row-primary');
    expect(COMPONENT_SRC).toContain('data-selected-row-secondary="expand-personal"');
    expect(COMPONENT_SRC).toContain('data-selected-row-secondary="cancel-personal"');
  });

  it('contiene los CTAs canónicos (primaria, secundaria, combinado)', () => {
    expect(COMPONENT_SRC).toContain('Usar como este punto');
    expect(COMPONENT_SRC).toContain('Guardar como punto personal');
    expect(COMPONENT_SRC).toContain('Guardar también como punto personal');
    expect(COMPONENT_SRC).toContain('Reemplazar y guardar personal');
  });

  it('NO usa el literal combinado anterior "Guardar ambas acciones"', () => {
    expect(COMPONENT_SRC).not.toContain('ambas acciones');
  });

  it('importa el helper único canReplaceCurrentPoi (sin duplicar lógica)', () => {
    expect(COMPONENT_SRC).toContain(
      "from '@/domains/content/lib/can-replace-current-poi'",
    );
    expect(COMPONENT_SRC).toContain('canReplaceCurrentPoi(location');
  });
});
