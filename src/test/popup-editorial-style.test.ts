/**
 * P-POPUP-10 — Editorial reading style guardrails.
 *
 * Comprueba que el cuerpo del popup se lee como una ficha editorial:
 *   - sin eyebrows uppercase "Descripción" / "Observación"
 *   - sin contador "N caracteres"
 *   - metadata line tipo byline (sin icono de reloj)
 *   - punto_destacado como entradilla italic con line-height generoso
 *   - observación con prefijo inline "Nota:"
 *   - breadcrumb sin underline plano (border-bottom transparente)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const POPUPS_SRC = readFileSync(resolve(__dirname, '../components/map/map-popups.ts'), 'utf8');
const GEO_SRC = readFileSync(resolve(__dirname, '../shared/popup/geo-header.ts'), 'utf8');

describe('P-POPUP-10 — descripción editorial', () => {
  it('NO renderiza eyebrow uppercase "Descripción"', () => {
    // El case 'descripcion' del switch no debe envolver el cuerpo con un label uppercase.
    const slice = POPUPS_SRC.split("case 'descripcion':")[1]?.split("case 'observacion'")[0] ?? '';
    expect(slice).not.toMatch(/>Descripción</);
    expect(slice).not.toMatch(/SECTION_HEADER\.textTransform/);
  });

  it('NO renderiza contador "N caracteres"', () => {
    const slice = POPUPS_SRC.split("case 'descripcion':")[1]?.split("case 'observacion'")[0] ?? '';
    expect(slice).not.toMatch(/caracteres</);
  });

  it('párrafos con line-height >= 1.7 y separación entre párrafos >= 12px', () => {
    const slice = POPUPS_SRC.split("case 'descripcion':")[1]?.split("case 'observacion'")[0] ?? '';
    expect(slice).toMatch(/line-height: 1\.7/);
    expect(slice).toMatch(/margin: 0 0 12px 0/);
  });
});

describe('P-POPUP-10 — observación editorial', () => {
  it('NO renderiza eyebrow uppercase "Observación" y SÍ incluye prefijo "Nota:"', () => {
    const slice = POPUPS_SRC.split("case 'observacion':")[1]?.split("case 'etiquetas_personales'")[0] ?? '';
    expect(slice).not.toMatch(/>Observación</);
    expect(slice).toContain('Nota:');
    expect(slice).toMatch(/line-height: 1\.65/);
  });
});

describe('P-POPUP-10.1 — punto_destacado como entradilla editorial', () => {
  it('usa stack serif editorial local, 15px / 1.75, sin italic, sin fondo, sin border-radius, acento lateral conservado', () => {
    const slice = POPUPS_SRC.split("case 'punto_destacado':")[1]?.split("case 'descripcion'")[0] ?? '';
    // Serif local: el font-family declara una stack que termina en `serif`.
    const fontFamilyMatch = slice.match(/font-family:\s*([^;"]+)/);
    expect(fontFamilyMatch).not.toBeNull();
    expect(fontFamilyMatch![1].trim().toLowerCase()).toMatch(/serif\s*$/);
    // Jerarquía editorial.
    expect(slice).toMatch(/font-size:\s*15px/);
    expect(slice).toMatch(/line-height:\s*1\.75/);
    // Sin italic, sin fondo tintado, sin esquinas redondeadas.
    expect(slice).not.toContain('font-style: italic');
    expect(slice).not.toContain('HIGHLIGHT.bgColor');
    expect(slice).toContain('background: transparent');
    expect(slice).not.toContain('border-radius');
    // Acento lateral conservado + padding reducido + margin inferior editorial.
    expect(slice).toContain('border-left');
    expect(slice).toContain('padding: 4px 0 4px 16px');
    expect(slice).toContain('margin: 0 0 20px 0');
  });
});

describe('P-POPUP-10 — byline metadata line', () => {
  it('buildOwnEnrichedMetadataLineHtml no incluye icono de reloj', () => {
    // El SVG del reloj (circle r=10 + polyline 12 6 12 12) no debe estar en el wrapper.
    const fn = POPUPS_SRC.split('export function buildOwnEnrichedMetadataLineHtml')[1]
      ?.split('export function ')[0] ?? '';
    expect(fn).not.toMatch(/polyline points="12 6 12 12 16 14"/);
    expect(fn).toMatch(/font-style: italic/); // datePart italic
    expect(fn).toMatch(/margin: 0 0 14px 0/);
  });
});

describe('P-POPUP-10 — breadcrumb territorial discreto', () => {
  it('no usa text-decoration: underline plano; usa border-bottom transparente', () => {
    const fn = GEO_SRC.split('export function buildTerritorialBreadcrumbHtml')[1] ?? '';
    expect(fn).toContain('border-bottom: 1px solid transparent');
    expect(fn).toContain('borderBottomColor');
    // separador con opacity bajada
    expect(fn).toContain('opacity: 0.45');
    // wrapper con margen inferior para respirar antes de la byline
    expect(fn).toContain('margin-bottom: 6px');
  });
});
