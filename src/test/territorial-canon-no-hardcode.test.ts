/**
 * Lint anti-hardcode: en módulos de resolución territorial NO se permiten
 * ramas lógicas comparando `country_code` / `countryCode` con literales ISO2
 * concretos (`'PT'`, `'ES'`, `'FR'`, …) ni con el nombre largo
 * (`'Portugal'`, `'Spain'`, …).
 *
 * El canon es data-driven: cualquier especialización por país DEBE pasar por
 * el mirror `territorial-canon.ts`. Esta regla protege la transversalidad
 * exigida por `docs/contracts/territorial-equivalence-canon.md`.
 *
 * Opt-out por línea: añadir `// canon-allow: <razón>` en la línea.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GUARDED_FILES = [
  'src/shared/geography/resolve-admin-fks.ts',
  'src/shared/geography/hierarchy.ts',
  'src/shared/geography/zone-region-guard.ts',
  'src/shared/geography/renormalize.ts',
  'src/components/filters/GeographyTree.tsx',
  'src/lib/parsers/shared.ts',
  'src/shared/import/canon-validator.ts',
  'supabase/functions/_shared/geo-normalizer.ts',
  'supabase/functions/_shared/reverse-geocode.ts',
];

const FORBIDDEN_ISO2 = ['PT', 'ES', 'FR', 'IT', 'GB', 'US', 'DE', 'NL', 'BR', 'JP', 'MX', 'AU'];
const FORBIDDEN_LONG_NAMES = ['Portugal', 'Spain', 'España', 'France', 'Francia', 'Italy', 'Italia', 'Germany', 'Alemania'];
// T2A-wire (§1.b) — iso_codes regionales y nombres de regiones cuya
// excepción canónica DEBE pasar por `regionHasNoProvincia` / canon, NUNCA
// por comparación literal en componentes/parsers/resolver.
const FORBIDDEN_REGION_ISO = ['PT-20', 'PT-30'];
const FORBIDDEN_REGION_NAMES = ['Açores', 'Azores', 'Madeira'];

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripLineComment(line: string): string {
  // Quita `// ...` salvo cuando va precedido por `:` (URLs `http://`) o `\` (regex literal).
  return line.replace(/([^:\\])\/\/.*$/, '$1').replace(/^\s*\/\/.*$/, '');
}

describe('territorial-canon — no hardcode en lógica territorial', () => {
  for (const rel of GUARDED_FILES) {
    const abs = resolve(process.cwd(), rel);
    if (!existsSync(abs)) continue;
    it(`${rel} no compara country literal contra ISO2 / nombre largo`, () => {
      const raw = readFileSync(abs, 'utf-8');
      const noBlocks = stripBlockComments(raw);
      const rawLines = raw.split('\n');
      const lines = noBlocks.split('\n');
      const violations: string[] = [];

      lines.forEach((line, idx) => {
        const original = rawLines[idx] ?? '';
        if (/canon-allow:/i.test(original)) return;
        const code = stripLineComment(line);
        if (!code.trim()) return;

        for (const iso of FORBIDDEN_ISO2) {
          const re = new RegExp(`(={2,3})\\s*['"\`]${iso}['"\`]`);
          if (re.test(code)) {
            violations.push(`L${idx + 1}: comparación con '${iso}' → ${original.trim()}`);
          }
        }
        for (const name of FORBIDDEN_LONG_NAMES) {
          const re = new RegExp(`(={2,3})\\s*['"\`]${name}['"\`]`);
          if (re.test(code)) {
            violations.push(`L${idx + 1}: comparación con '${name}' → ${original.trim()}`);
          }
        }
        // T2A-wire (§1.b) — excepciones regionales: prohibir comparación
        // literal contra iso_code regional (PT-20/PT-30) o contra nombre
        // de región insular. El SoT es `regionHasNoProvincia` (canon).
        for (const iso of FORBIDDEN_REGION_ISO) {
          const re = new RegExp(`(={2,3})\\s*['"\`]${iso}['"\`]`);
          if (re.test(code)) {
            violations.push(`L${idx + 1}: comparación con region iso '${iso}' → ${original.trim()}`);
          }
        }
        for (const name of FORBIDDEN_REGION_NAMES) {
          const re = new RegExp(`(={2,3})\\s*['"\`]${name}['"\`]`);
          if (re.test(code)) {
            violations.push(`L${idx + 1}: comparación con region name '${name}' → ${original.trim()}`);
          }
        }
      });

      expect(
        violations,
        `\nHardcode detectado en ${rel}. Usa territorial-canon.ts (helpers por ISO2).\n${violations.join('\n')}`,
      ).toEqual([]);
    });
  }

  it('al menos un fichero vigilado existe (el lint no es no-op)', () => {
    const present = GUARDED_FILES.filter((rel) => existsSync(resolve(process.cwd(), rel)));
    expect(present.length).toBeGreaterThan(0);
  });
});
