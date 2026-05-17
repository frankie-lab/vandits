/**
 * P-POPUP-13 — Unified popup renderer (static + behavioral guards).
 *
 * Invariantes:
 *   - `createPopupContent` ya NO bifurca shell por `isPointEnriched`.
 *     Existe un único bloque canónico (marker `P-POPUP-13 — Renderer único`).
 *   - El shell canónico aplica a TODOS los POIs, con o sin
 *     `enriched_data.descripcion`.
 *   - Ningún POI puede emitir: `Ficha IA actualizada`, `+N campos más`,
 *     chips territoriales antiguos (`#e0f2fe/#dcfce7/#fef3c7/#f3e8ff`),
 *     gradient `#16a34a → #22c55e` para "Añadir a mi colección",
 *     borde `#f0f0f0` para customData, footer sin `data-popup-footer="v1"`.
 *   - El POI sin enriched se sigue renderizando con el mismo shell, breadcrumb,
 *     footer persistente, y degrada graciosamente:
 *       - descripción → `location.description` si existe
 *       - customData → bloque `<details data-popup-fallback-customdata="v1">`
 *         con cuenta exacta (sin `+N`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(resolve(__dirname, '../components/map/map-popups.ts'), 'utf8');

describe('P-POPUP-13 — Unified popup renderer (static guards)', () => {
  it('expone marker canónico único `P-POPUP-13 — Renderer único`', () => {
    expect(SRC).toContain('P-POPUP-13 — Renderer único');
  });

  it('NO contiene la antigua bifurcación `if (isEnriched && enriched) {`', () => {
    expect(SRC).not.toContain('if (isEnriched && enriched) {');
  });

  it('NO contiene la cadena legacy `Ficha IA actualizada`', () => {
    expect(SRC).not.toContain('Ficha IA actualizada');
  });

  it('NO emite el contador legacy `+N campos más`', () => {
    expect(SRC).not.toContain('campos más');
    expect(SRC).not.toMatch(/\$\{moreDataCount\}/);
  });

  it('NO contiene chips territoriales antiguos (#e0f2fe / #dcfce7 / #fef3c7 / #f3e8ff)', () => {
    // Los chips legacy usaban exactamente `padding: 2px 8px; border-radius: 12px`
    // con bg `#e0f2fe`/`#dcfce7`/`#fef3c7`/`#f3e8ff`. El breadcrumb canónico
    // (P-POPUP-9) usa link textual muted sin fondo.
    expect(SRC).not.toMatch(/background:\s*#e0f2fe/);
    expect(SRC).not.toMatch(/background:\s*#dcfce7/);
    expect(SRC).not.toMatch(/background:\s*#fef3c7;[^}]*?border-radius:\s*12px/);
    expect(SRC).not.toMatch(/background:\s*#f3e8ff/);
  });

  it('NO emite el botón verde legacy `linear-gradient(135deg, #16a34a, #22c55e)`', () => {
    expect(SRC).not.toMatch(/linear-gradient\(135deg,\s*#16a34a,\s*#22c55e\)/);
  });

  it('NO emite borde gris legacy `border: 1px solid #f0f0f0`', () => {
    expect(SRC).not.toMatch(/border:\s*1px solid\s*#f0f0f0/);
  });

  it('mantiene un único footer persistente `data-popup-footer="v1"`', () => {
    const matches = SRC.match(/data-popup-footer="v1"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('mantiene un único mount point `data-recovery-root`', () => {
    const matches = SRC.match(/data-recovery-root="\$\{location\.id\}"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('expone el fallback de customData (`data-popup-fallback-customdata="v1"`)', () => {
    expect(SRC).toContain('data-popup-fallback-customdata="v1"');
  });

  it('el fallback de customData se gate por `!isEnriched`', () => {
    expect(SRC).toMatch(/\(!isEnriched\)\s*\?\s*\(\(\)\s*=>/);
  });

  it('la descripción canónica degrada a `location.description` cuando no hay enriched', () => {
    expect(SRC).toMatch(/enriched\.descripcion\s*\|\|\s*\(!isEnriched\s*\?\s*\(location\.description\s*\|\|\s*''\)\s*:\s*''\)/);
  });

  it('`enriched` se normaliza a objeto vacío para alimentar el composer', () => {
    expect(SRC).toMatch(/const\s+enriched:\s*any\s*=\s*location\.enrichedData\s*\?\?\s*\{\}/);
  });

  it('addToCollection ya NO usa gradient verde ni shadow ni translateY', () => {
    const idx = SRC.indexOf('data-action="add-to-collection"');
    expect(idx).toBeGreaterThan(-1);
    const slice = SRC.slice(idx, idx + 1200);
    expect(slice).not.toMatch(/linear-gradient/);
    expect(slice).not.toMatch(/box-shadow:\s*0 2px 8px rgba\(22,\s*163,\s*74/);
    expect(slice).not.toMatch(/translateY\(-1px\)/);
    expect(slice).toMatch(/hsl\(var\(--muted\)\)/);
  });

  it('route-waypoint actions migradas: sin gradient amarillo `#fef3c7→#fde68a`, sin translateY', () => {
    const idx = SRC.indexOf('data-action="view-nearby"');
    if (idx > -1) {
      const slice = SRC.slice(idx, idx + 2000);
      expect(slice).not.toMatch(/linear-gradient\(135deg,\s*#fef3c7/);
      expect(slice).not.toMatch(/translateY/);
    }
  });
});
