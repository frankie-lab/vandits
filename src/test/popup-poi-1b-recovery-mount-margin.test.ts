/**
 * P-POI-CURATION-2.10 — Two-rail popup body canon.
 *
 * El popup-scroll-body admite dos tipos de hijos directos:
 *   1. Wrapper editorial (padding: 16px 16px 8px 16px) para prosa/hero/
 *      breadcrumb/ratings/descripción/observación/custom-data.
 *   2. Slots interactivos full-width (data-recovery-root,
 *      data-route-waypoint-actions) emitidos como hijos DIRECTOS del
 *      scroll-body, sin gutter editorial heredado y SIN márgenes negativos.
 *
 * Esta es la solución estructural a la "caja general" que envolvía la lista
 * de candidatos del bloque Contexto cercano (P-POI-CURATION-2.6 intentó
 * compensarlo con margin lateral reducido a 4px; 2.10 lo resuelve sacando
 * el slot del wrapper editorial).
 *
 * Alcance cerrado: solo verifica la estructura emitida en `map-popups.ts`.
 * No toca filas, NearbyPanel, lógica de curación, niveles POI ni shell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');
const source = readFileSync(SRC, 'utf8');

describe('P-POI-CURATION-2.10 — two-rail popup body', () => {
  it('emite el wrapper editorial con padding 16px (carril de prosa intacto)', () => {
    expect(source).toContain('<div style="padding: 16px 16px 8px 16px;">');
  });

  it('data-recovery-root usa gutter ligero propio del rail interactivo (8px laterales, canon 2.11)', () => {
    expect(source).toContain(
      'data-recovery-root="${location.id}" style="margin: 0 8px 8px 8px;"',
    );
  });

  it('data-recovery-root NO hereda el gutter editorial (margin 16px lateral)', () => {
    expect(source).not.toContain(
      'data-recovery-root="${location.id}" style="margin: 0 16px 8px 16px;"',
    );
  });

  it('data-recovery-root NO usa el margen reducido del canon 2.6 (4px)', () => {
    expect(source).not.toContain(
      'data-recovery-root="${location.id}" style="margin: 0 4px 8px 4px;"',
    );
  });

  it('data-recovery-root NO vuelve al full-bleed absoluto del canon 2.10 (margin lateral 0)', () => {
    expect(source).not.toContain(
      'data-recovery-root="${location.id}" style="margin: 0 0 8px 0;"',
    );
  });

  it('data-recovery-root NO usa márgenes negativos como parche (anti 2.10-A)', () => {
    expect(source).not.toMatch(
      /data-recovery-root="\$\{location\.id\}"\s+style="[^"]*margin:[^"]*-\d/,
    );
  });

  it('data-recovery-root NO usa márgenes negativos como parche (anti 2.10-A)', () => {
    expect(source).not.toMatch(
      /data-recovery-root="\$\{location\.id\}"\s+style="[^"]*margin:[^"]*-\d/,
    );
  });

  it('estructuralmente: data-recovery-root vive DESPUÉS del cierre del wrapper editorial', () => {
    // El wrapper editorial se abre en línea ~1418 y debe cerrar ANTES del
    // recovery-root. Verificamos que entre `</div>` (cierre editorial) y la
    // emisión del recovery-root no haya un `padding: 16px 16px` reabriéndose.
    const recoveryIdx = source.indexOf('data-recovery-root="${location.id}"');
    expect(recoveryIdx).toBeGreaterThan(-1);
    // Tomamos un segmento anterior razonable (1000 chars) y comprobamos que
    // el ÚLTIMO marcador estructural justo antes es el cierre del wrapper
    // editorial, no su apertura.
    const before = source.slice(Math.max(0, recoveryIdx - 1500), recoveryIdx);
    const lastOpen = before.lastIndexOf('<div style="padding: 16px 16px 8px 16px;">');
    const lastClose = before.lastIndexOf('</div>');
    expect(lastClose).toBeGreaterThan(lastOpen);
  });

  it('emite el slot interactivo de route-waypoint con marcador estable', () => {
    expect(source).toContain('data-route-waypoint-actions="v1"');
  });
});
