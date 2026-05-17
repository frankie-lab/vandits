/**
 * P-POPUP-11 — Footer persistente + dedupe estado IA + secundarios discretos.
 *
 * Invariantes:
 *   - El popup enriquecido NO contiene el bloque "Ficha IA actualizada"
 *     (duplicaba el pill "Enriquecido <fecha>" del footer).
 *   - Existe un nodo footer (`data-popup-footer="v1"`) hermano del scroll-body,
 *     que aloja las acciones técnicas persistentes.
 *   - Re-enriquecer ya no usa gradiente violeta agresivo.
 *   - Los acordeones secundarios (`wrapCollapsibleSection`) no aplican
 *     `border 1px`/`SECTION_HEADER.bgColor`/`borderRadius` completo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const POPUPS_SRC = readFileSync(resolve(__dirname, '../components/map/map-popups.ts'), 'utf8');

describe('P-POPUP-11 — dedupe estado IA', () => {
  it('NO contiene la línea "Ficha IA actualizada"', () => {
    expect(POPUPS_SRC).not.toMatch(/Ficha IA actualizada/);
  });

  it('mantiene el pill "Enriquecido" en el footer', () => {
    expect(POPUPS_SRC).toMatch(/Enriquecido \$\{location\.updatedAt/);
  });
});

describe('P-POPUP-11 — footer persistente', () => {
  it('emite `data-popup-footer="v1"` como sibling del scroll body', () => {
    expect(POPUPS_SRC).toMatch(/data-popup-footer="v1"/);
  });

  it('footer aplica flex-shrink:0, separador y fondo muted suave', () => {
    const footerSlice = POPUPS_SRC.split('data-popup-footer="v1"')[1]?.slice(0, 400) ?? '';
    expect(footerSlice).toMatch(/flex-shrink:\s*0/);
    expect(footerSlice).toMatch(/border-top:\s*1px solid hsl\(var\(--border\)\)/);
    expect(footerSlice).toMatch(/hsl\(var\(--muted\)\s*\/\s*0\.4\)/);
  });

  it('el bloque actionButtonsHtml ya no añade su propio border-top duplicado', () => {
    const slice = POPUPS_SRC.split('const actionButtonsHtml = `')[1]?.split('`;')[0] ?? '';
    // La fila de botones interna ya no aplica border-top: el footer lo posee.
    expect(slice).not.toMatch(/border-top:\s*1px solid #e5e7eb/);
  });
});

describe('P-POPUP-11 — Re-enriquecer sin gradiente agresivo', () => {
  it('NO usa el gradiente violeta #8b5cf6 → #7c3aed', () => {
    const enrichBtn = POPUPS_SRC.split('data-action="enrich"')[1]?.slice(0, 600) ?? '';
    expect(enrichBtn).not.toMatch(/linear-gradient\(135deg, #8b5cf6/);
    expect(enrichBtn).toMatch(/hsl\(var\(--primary\)\s*\/\s*0\.12\)/);
  });
});

describe('P-POPUP-11 — secundarios discretos', () => {
  it('wrapCollapsibleSection ya no aplica border 1px completo ni borderRadius', () => {
    const wrapFn = POPUPS_SRC.split('function wrapCollapsibleSection(')[1]?.split('\n}')[0] ?? '';
    expect(wrapFn).not.toMatch(/border:\s*1px solid \$\{COLOR\.border\}/);
    expect(wrapFn).not.toMatch(/border-radius:\s*\$\{CARD\.sectionRadius\}/);
    expect(wrapFn).not.toMatch(/background:\s*\$\{SECTION_HEADER\.bgColor\}/);
    // Conserva un separador superior discreto entre secundarios.
    expect(wrapFn).toMatch(/border-top:\s*1px solid hsl\(var\(--border\)\s*\/\s*0\.6\)/);
  });
});
