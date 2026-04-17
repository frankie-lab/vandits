/**
 * index-composition.test.ts
 *
 * Guardrail estructural: garantiza que `pages/Index.tsx` se mantiene como un
 * archivo de COMPOSICIÓN (renderiza paneles + delega lógica a hooks de dominio)
 * y NO acumula `useEffect` transversales ni lógica de negocio inline.
 *
 * Si este test falla:
 *   - Probablemente añadiste un `useEffect` o `useState` a Index.tsx que
 *     debería vivir en un hook de dominio (`@/domains/*` o `@/hooks/use-*`).
 *   - Extrae esa lógica antes de continuar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INDEX_PATH = resolve(__dirname, '../pages/Index.tsx');
const source = readFileSync(INDEX_PATH, 'utf-8');

describe('Index.tsx composition guardrails', () => {
  it('stays under the 450-line composition budget', () => {
    const lines = source.split('\n').length;
    expect(lines).toBeLessThan(450);
  });

  it('uses at most 2 inline useEffect hooks', () => {
    const matches = source.match(/\buseEffect\s*\(/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it('uses at most 6 inline useState hooks (rest must live in domain hooks)', () => {
    const matches = source.match(/\buseState\s*[<(]/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(6);
  });

  it('does not import from forbidden legacy hook paths', () => {
    const forbidden = [
      "from '@/hooks/use-auth'",
      "from '@/hooks/use-routes'",
      "from '@/hooks/use-route-calculation'",
      "from '@/hooks/use-route-stops'",
      "from '@/hooks/use-travel-advisor'",
      "from '@/hooks/use-social-stats'",
      "from '@/hooks/use-database-sync'",
      "from '@/hooks/use-permissions'",
      "from '@/store/locations-store'",
    ];
    for (const needle of forbidden) {
      expect(source).not.toContain(needle);
    }
  });

  it('delegates panel state to usePanelToggles', () => {
    expect(source).toContain('usePanelToggles');
  });
});
