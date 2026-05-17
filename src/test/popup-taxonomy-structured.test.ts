/**
 * P-POPUP-12 — Canon de taxonomía editorial estructurada.
 *
 * Verifica el bloque `case 'etiquetas'` reescrito en map-popups.ts:
 *  - 4 familias (taxonomy / semantic / personal / cultural).
 *  - Máximo 5 chips visibles por familia (slice hard, sin overflow).
 *  - NO aparece `+N`, `más`, ni chip overflow.
 *  - Familias separadas por divisor `border-top: 1px solid hsl(var(--border) / 0.6)`.
 *  - `justify-content: center` presente.
 *  - El bloque es marcado con `data-popup-taxonomy-block="v1"`.
 *
 * Test estático sobre el código fuente: garantiza la forma del bloque
 * sin levantar React/Leaflet.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = resolve(__dirname, '../components/map/map-popups.ts');

function extractEtiquetasCase(src: string): string {
  const lines = src.split('\n');
  const startIdx = lines.findIndex((l) => l.includes("case 'etiquetas':"));
  if (startIdx < 0) throw new Error("case 'etiquetas' not found");
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
  throw new Error("case 'etiquetas' end not found");
}

const src = readFileSync(SRC, 'utf8');
const body = extractEtiquetasCase(src);

describe('P-POPUP-12 — taxonomía editorial estructurada', () => {
  it('no contiene ningún overflow visual ("+N", "+${overflow}", "más")', () => {
    // Sin chips `+N más`, sin variable overflow.
    expect(body).not.toMatch(/\+\$\{overflow\}/);
    expect(body).not.toMatch(/"\+\$\{/);
    expect(body).not.toMatch(/title="\+\d/);
    expect(body).not.toMatch(/\+\d+ más/);
    // No queda el path legacy `etiquetas_geograficas` como chips.
    expect(body).not.toMatch(/inlineTagBadge\([^)]*'geo'/);
  });

  it('renderiza familias centradas con justify-content: center', () => {
    expect(body).toContain('justify-content: center');
  });

  it('usa el wrapper canónico data-popup-taxonomy-block="v1"', () => {
    expect(body).toContain('data-popup-taxonomy-block="v1"');
  });

  it('marca cada familia con data-tag-family', () => {
    expect(body).toContain('data-tag-family="${palette}"');
  });

  it('compone 4 familias en el orden canónico (taxonomy → semantic → user → cultural)', () => {
    const idxTaxonomy = body.indexOf("'classification'");
    const idxSemantic = body.indexOf("'thematic'");
    const idxUser = body.indexOf("'personal'");
    const idxCultural = body.indexOf("'cultural'");
    expect(idxTaxonomy).toBeGreaterThan(-1);
    expect(idxSemantic).toBeGreaterThan(idxTaxonomy);
    expect(idxUser).toBeGreaterThan(idxSemantic);
    expect(idxCultural).toBeGreaterThan(idxUser);
  });

  it('aplica slice(0, cap) sin contar overflow', () => {
    expect(body).toMatch(/items\.slice\(0, cap\)/);
    // No debe quedar la variable `overflow`.
    expect(body).not.toMatch(/const overflow\s*=/);
  });

  it('inserta divisor entre familias usando hsl(var(--border) / 0.6)', () => {
    expect(body).toMatch(/border-top:\s*1px solid hsl\(var\(--border\) \/ 0\.6\)/);
  });

  it('lee cultural_context.type_label como 4ª familia (chip único)', () => {
    expect(body).toContain('cultural_context');
    expect(body).toContain("'cultural'");
    expect(body).toMatch(/cc\?\.type_label/);
  });

  it('omite el bloque entero si no hay ninguna familia (familyRows.length === 0)', () => {
    expect(body).toMatch(/familyRows\.length === 0\s*\)\s*return\s*''/);
  });
});

describe('P-POPUP-12 — palette cultural disponible en TAG_COLORS', () => {
  it('expone variant "cultural" en card-style-tokens', async () => {
    const mod = await import('@/lib/card-style-tokens');
    expect(mod.TAG_COLORS).toHaveProperty('cultural');
    expect((mod.TAG_COLORS as any).cultural.bg).toBe('#ede9fe');
    expect((mod.TAG_COLORS as any).cultural.text).toBe('#5b21b6');
  });
});
