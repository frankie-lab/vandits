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

  it('mantiene el texto "Enriquecido ·" como pie informativo', () => {
    expect(POPUPS_SRC).toMatch(/Enriquecido · \$\{formatRegistrationDate\(location\.updatedAt!\)\}/);
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
    expect(slice).not.toMatch(/border-top:\s*1px solid #e5e7eb/);
  });
});

describe('P-POPUP-11 — Re-enriquecer sin gradiente agresivo', () => {
  it('NO usa el gradiente violeta #8b5cf6 → #7c3aed y usa primary suave', () => {
    const enrichBtn = POPUPS_SRC.split('data-action="enrich"')[1]?.slice(0, 800) ?? '';
    expect(enrichBtn).not.toMatch(/linear-gradient\(135deg, #8b5cf6/);
    expect(enrichBtn).toMatch(/hsl\(var\(--primary\)\s*\/\s*0\.10\)/);
  });
});

describe('P-POPUP-11 — secundarios discretos', () => {
  it('wrapCollapsibleSection ya no aplica border 1px completo ni borderRadius', () => {
    const wrapFn = POPUPS_SRC.split('function wrapCollapsibleSection(')[1]?.split('\n}')[0] ?? '';
    expect(wrapFn).not.toMatch(/border:\s*1px solid \$\{COLOR\.border\}/);
    expect(wrapFn).not.toMatch(/border-radius:\s*\$\{CARD\.sectionRadius\}/);
    expect(wrapFn).not.toMatch(/background:\s*\$\{SECTION_HEADER\.bgColor\}/);
    expect(wrapFn).toMatch(/border-top:\s*1px solid hsl\(var\(--border\)\s*\/\s*0\.6\)/);
  });
});

describe('P-POPUP-11.1 — footer hierarchy refinement', () => {
  it('Re-enriquecer no se renderiza dentro del pill verde #f0fdf4', () => {
    const enrichBtn = POPUPS_SRC.split('data-action="enrich"')[1]?.slice(0, 800) ?? '';
    expect(enrichBtn).not.toMatch(/background:\s*#f0fdf4/);
  });

  it('Borrar es icon-only sobre fondo transparente (sin #fef2f2)', () => {
    const delBtn = POPUPS_SRC.split('data-action="delete-location"')[1]?.slice(0, 800) ?? '';
    expect(delBtn).not.toMatch(/background:\s*#fef2f2/);
    expect(delBtn).toMatch(/background:\s*transparent/);
    expect(delBtn).toMatch(/hsl\(var\(--destructive\)/);
  });

  it('Notas usa paleta muted neutra (sin #fef3c7/#92400e/translateY)', () => {
    const notesBtn = POPUPS_SRC.split('data-action="add-notes"')[1]?.slice(0, 800) ?? '';
    expect(notesBtn).not.toMatch(/#fef3c7/);
    expect(notesBtn).not.toMatch(/#92400e/);
    expect(notesBtn).not.toMatch(/translateY/);
    expect(notesBtn).toMatch(/hsl\(var\(--muted\)\)/);
  });

  it('Fila de acciones usa grid 32px | 1fr | 32px', () => {
    expect(POPUPS_SRC).toMatch(/grid-template-columns:\s*32px\s+1fr\s+32px/);
  });

  it('Pie informativo "Enriquecido ·" centrado y muted', () => {
    const idx = POPUPS_SRC.indexOf('Enriquecido ·');
    expect(idx).toBeGreaterThan(-1);
    const before = POPUPS_SRC.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/text-align:\s*center/);
    expect(before).toMatch(/hsl\(var\(--muted-foreground\)\)/);
  });
});
