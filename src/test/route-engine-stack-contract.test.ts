/**
 * Contract test — PR-BACKOFFICE-UX-CANON-4
 *
 * Documenta el modelo REAL del motor de rutas:
 *   1. No existe storage GLOBAL escribible para EngineConfig.
 *      El único default global es la constante hardcoded DEFAULT_ENGINE_CONFIG.
 *   2. El override por usuario vive en `profiles.route_engine_defaults`.
 *      El panel admin "Motor de rutas — mis defaults" escribe SOLO en la fila
 *      del usuario actual (admin incluido), no en una tabla global.
 *   3. calculate-route resuelve por usuario: default → override propio → ajustes por-ruta.
 *
 * Si algún día se añade una tabla global (`app_settings.route_engine_global` o
 * equivalente), este test debe actualizarse para reflejar el nuevo stack.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/route-engine';

const PANEL = readFileSync(
  join(process.cwd(), 'src/components/RouteSettingsPanel.tsx'),
  'utf-8',
);

describe('route-engine stack contract (PR-BACKOFFICE-UX-CANON-4)', () => {
  it('DEFAULT_ENGINE_CONFIG existe como baseline read-only', () => {
    expect(DEFAULT_ENGINE_CONFIG).toBeDefined();
    expect(typeof DEFAULT_ENGINE_CONFIG.transportMode).toBe('string');
  });

  it('admin panel escribe a profiles.route_engine_defaults filtrado por user.id', () => {
    expect(PANEL).toContain("from('profiles')");
    expect(PANEL).toContain('route_engine_defaults');
    expect(PANEL).toMatch(/\.eq\('id',\s*user\.id\)/);
  });

  it('admin panel NO escribe a ninguna tabla global (app_settings/route_engine_global)', () => {
    // Defensa contra regresiones: si un futuro PR introduce storage global,
    // este test obliga a actualizar el contrato y el modelo UX.
    expect(PANEL).not.toMatch(/app_settings.*route/i);
    expect(PANEL).not.toMatch(/route_engine_global/);
  });

  it('admin panel expone el stack de resolución (default → override → efectivo)', () => {
    expect(PANEL).toMatch(/Stack de resolución/);
    expect(PANEL).toMatch(/override personal/i);
  });

  it('admin panel ofrece quitar el override personal', () => {
    expect(PANEL).toMatch(/handleClearOverride/);
    expect(PANEL).toMatch(/route_engine_defaults:\s*null/);
  });
});
