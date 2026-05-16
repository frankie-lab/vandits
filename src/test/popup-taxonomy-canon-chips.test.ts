/**
 * P-POPUP-6A — Taxonomy canonical representation = chips.
 *
 * Garantiza:
 *  - El bloque `case 'clasificacion'` ya NO renderiza el breadcrumb textual
 *    (codigo `2.5.x`, categoria_principal, `›`, subcategoria).
 *  - El catálogo `codigo` (p.ej. "2.5.x") no aparece en ningún lugar del case.
 *  - `cultural_context.type_label` sigue siendo el único contenido del slot
 *    y se omite el contenedor completo cuando no hay cultural_context.
 *  - Taxonomy sigue disponible como chips canon via `getCanonicalPopupTags`
 *    y el dedupe taxonomy ↔ semantic ↔ user se mantiene intacto.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getCanonicalPopupTags, tagSlug } from '@/shared/popup/tags';
import type { GeoLocation } from '@/types/location';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');

/** Extract the body of `case 'clasificacion':` block from map-popups.ts. */
function extractClasificacionCase(src: string): string {
  const lines = src.split('\n');
  const startIdx = lines.findIndex((l) => l.includes("case 'clasificacion':"));
  if (startIdx < 0) throw new Error("case 'clasificacion' not found");
  let depth = 0;
  let started = false;
  const collected: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    collected.push(line);
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        depth--;
        if (started && depth === 0) return collected.join('\n');
      }
    }
  }
  throw new Error("case 'clasificacion' end not found");
}

const src = readFileSync(SRC, 'utf8');
const body = extractClasificacionCase(src);

describe('P-POPUP-6A — clasificacion block (breadcrumb removed)', () => {
  it('no longer reads enriched.clasificacion.codigo', () => {
    expect(body).not.toMatch(/enriched\.clasificacion\?\.codigo/);
    expect(body).not.toMatch(/enriched\.clasificacion\.codigo/);
  });

  it('no longer reads categoria_principal / subcategoria in this slot', () => {
    expect(body).not.toMatch(/enriched\.clasificacion\?\.categoria_principal/);
    expect(body).not.toMatch(/enriched\.clasificacion\?\.subcategoria/);
  });

  it('no longer renders the breadcrumb separator "›"', () => {
    expect(body).not.toContain('›');
  });

  it('returns "" when there is no cultural_context (no empty container)', () => {
    // Heuristic: the case body must contain an early-return on missing cc.
    expect(body).toMatch(/if\s*\(\s*!cc\?\.type_label\s*\)\s*return\s*''/);
  });

  it('still renders cultural_context.type_label as a Wikidata chip', () => {
    expect(body).toContain('Wikidata');
    expect(body).toContain('cc.type_label');
  });
});

describe('P-POPUP-6A — taxonomy chips canon preserved', () => {
  function makeLoc(enriched: any): GeoLocation {
    return {
      id: 't',
      name: 't',
      coordinates: { lat: 0, lng: 0 },
      enrichedData: enriched,
    } as unknown as GeoLocation;
  }

  it('exposes 3-level taxonomy as chips bucket', () => {
    const loc = makeLoc({
      clasificacion: {
        codigo: '2.5.1',
        categoria_principal: '2. Entidades construidas',
        subcategoria: '2.5 Recintos',
        tipo_especifico: '2.5.1 Complejo / Recinto',
      },
    });
    const out = getCanonicalPopupTags(loc, [], []);
    expect(out.taxonomy).toEqual([
      'Entidades construidas',
      'Recintos',
      'Complejo / Recinto',
    ]);
  });

  it('dedupes semantic chip whose slug == taxonomy slug', () => {
    const loc = makeLoc({
      clasificacion: { categoria_principal: '2. Entidades construidas', subcategoria: '2.5 Recintos', tipo_especifico: 'Complejo / Recinto' },
      etiquetas: ['Complejo/Recinto', 'Arquitectura militar'],
    });
    const out = getCanonicalPopupTags(loc, [], []);
    // Semantic with same slug as a taxonomy term must be suppressed.
    expect(out.semantic.map((s) => tagSlug(s))).not.toContain(tagSlug('Complejo/Recinto'));
    expect(out.semantic.map((s) => tagSlug(s))).toContain(tagSlug('Arquitectura militar'));
  });

  it('dedupes personal tag whose slug == taxonomy slug', () => {
    const loc = makeLoc({
      clasificacion: { categoria_principal: '2. Entidades construidas', tipo_especifico: 'Complejo / Recinto' },
    });
    const out = getCanonicalPopupTags(loc, [], ['Complejo / Recinto', 'mi-favorito']);
    expect(out.user.map((s) => tagSlug(s))).not.toContain(tagSlug('Complejo / Recinto'));
    expect(out.user.map((s) => tagSlug(s))).toContain(tagSlug('mi-favorito'));
  });
});
