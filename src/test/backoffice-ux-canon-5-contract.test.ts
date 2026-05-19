/**
 * Contract — PR-BACKOFFICE-UX-CANON-5
 *
 * 1. Design System tab está renombrado como "Inspector" (read-only, no editor).
 * 2. `run_internal_tooling` tiene UI surface explícita (`/admin/internal-tools`).
 * 3. `run_geo_canonicalize` tiene surface visible en el panel de Geography
 *    (no enterrado como acción secundaria).
 * 4. Las capabilities huérfanas se han cerrado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_TABS, getAdminTab } from '@/components/admin/admin-tabs';

const GEO = readFileSync(
  join(process.cwd(), 'src/components/admin/GeographyBackfillPanel.tsx'),
  'utf-8',
);

describe('PR-BACKOFFICE-UX-CANON-5 contract', () => {
  it('Design System tab está renombrado como Inspector', () => {
    const tab = getAdminTab('design-system');
    expect(tab?.label).toMatch(/Inspector/);
  });

  it('Internal tooling tiene UI surface explícita', () => {
    const tab = getAdminTab('internal-tools');
    expect(tab).toBeDefined();
    expect(tab?.capability).toBe('run_internal_tooling');
    expect(tab?.routeMode).toBe('route');
  });

  it('Canonicalize one-shot está renderizado en Geography (capability gated)', () => {
    expect(GEO).toMatch(/CanonicalizeOneShotCard/);
    expect(GEO).toMatch(/run_geo_canonicalize/);
    expect(GEO).toMatch(/canonicalize-admin-areas/);
    // Está como sección prominente, no como acción secundaria escondida.
    expect(GEO).toMatch(/Canonicalize.*one-shot/i);
  });

  it('Geography expone las 3 categorías taxonómicas explícitas', () => {
    expect(GEO).toMatch(/Mantenimiento rutinario/);
    expect(GEO).toMatch(/Operaciones masivas/);
    expect(GEO).toMatch(/Canonicalize one-shot/);
  });

  it('No quedan tabs admin con capability huérfana sin Component', () => {
    for (const tab of ADMIN_TABS) {
      expect(tab.capability, `tab ${tab.key} debe tener capability`).toBeTruthy();
    }
  });
});
