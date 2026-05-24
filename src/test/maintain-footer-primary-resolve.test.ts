/**
 * PR-MAINTAIN-FOOTER-1 — contract test.
 *
 * En `EffectiveActionFooter` con `mode='debt'`, el primary NUNCA puede ser
 * `Exportar` ni `Geo Maintenance`. Siempre `Resolver` (singular o batch).
 *
 * Ver mem://ui/discovery/maintain-footer-resolve-canon
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/filters/EffectiveActionFooter.tsx'),
  'utf-8',
);

describe('PR-MAINTAIN-FOOTER-1: Mantener footer primary canon', () => {
  it('debt branch never sets primary testid to footer-primary-export', () => {
    // Find the `if (mode === 'debt') { ... }` block inside the primary IIFE.
    const debtMatch = SOURCE.match(/if \(mode === 'debt'\)[\s\S]*?(?=\n {4}if \(mode === 'unenriched'\))/);
    expect(debtMatch, 'debt branch must exist in primary IIFE').not.toBeNull();
    const debtBlock = debtMatch![0];
    expect(debtBlock).not.toContain("'footer-primary-export'");
    expect(debtBlock).not.toContain("'footer-primary-geo-maintenance'");
  });

  it('debt branch emits both resolve variants (single + batch)', () => {
    expect(SOURCE).toContain("'footer-primary-resolve-single'");
    expect(SOURCE).toContain("'footer-primary-resolve-debt'");
  });

  it('emits the canonical lovable:open-poi-popup event for singular resolve', () => {
    expect(SOURCE).toContain("'lovable:open-poi-popup'");
    expect(SOURCE).toContain("'maintain-resolve-single'");
  });

  it('Exportar is shown in Más acciones for mode=debt (escape hatch)', () => {
    // showExportInMenu must include `mode === 'debt'`.
    expect(SOURCE).toMatch(/showExportInMenu\s*=\s*\n?\s*mode === 'debt'/);
  });
});
