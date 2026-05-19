/**
 * Contract test (PR-BACKOFFICE-GOVERNANCE F1):
 * El SoT TS cliente (`src/domains/identity/capabilities.ts`) y el SoT Deno
 * (`supabase/functions/_shared/capabilities.ts`) DEBEN exportar el mismo
 * catálogo, en el mismo orden. Si divergen, este test falla y obliga a
 * actualizar ambos a la vez (y a actualizar el enum DB si aplica).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPABILITIES } from '@/domains/identity/capabilities';

function extractDenoCapabilities(): string[] {
  const path = resolve(__dirname, '../../supabase/functions/_shared/capabilities.ts');
  const src = readFileSync(path, 'utf-8');
  // Match `export const CAPABILITIES = [ ... ] as const;`
  const match = src.match(/export const CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error('Could not locate CAPABILITIES literal in Deno SoT');
  return Array.from(match[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1]);
}

describe('capabilities SoT — TS ↔ Deno parity', () => {
  it('TS and Deno catalogues are byte-identical and in the same order', () => {
    const deno = extractDenoCapabilities();
    expect(deno).toEqual([...CAPABILITIES]);
  });

  it('catalogue has no duplicates', () => {
    const set = new Set<string>(CAPABILITIES);
    expect(set.size).toBe(CAPABILITIES.length);
  });
});
