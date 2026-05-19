/**
 * PR-MASTER-BYPASS-1 — Contract test.
 *
 * Garantiza que `public.has_permission(uid, cap)` mantiene el bypass implícito
 * para el rol `master`. Master es supercap implícita: no depende de filas
 * mutables en `role_permissions`. Si la migración se revierte, este test rompe.
 *
 * Verificación estática sobre el archivo SQL de la migración canónica:
 *   - Debe contener `has_role(_user_id, 'master')`
 *   - Debe seguir consultando `role_permissions` para el resto de roles (OR)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('PR-MASTER-BYPASS-1 · has_permission contract', () => {
  it('canonical migration contains master bypass + role_permissions fallback', () => {
    const migrationsDir = join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    // Buscar la última migración que (re)defina has_permission.
    const hits = files
      .map(f => ({ f, body: readFileSync(join(migrationsDir, f), 'utf-8') }))
      .filter(({ body }) =>
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_permission/i.test(body),
      )
      .sort((a, b) => a.f.localeCompare(b.f));

    expect(hits.length, 'has_permission migration not found').toBeGreaterThan(0);
    const latest = hits[hits.length - 1].body;

    // Bypass master implícito.
    expect(latest).toMatch(/has_role\(\s*_user_id\s*,\s*'master'/i);
    // Fallback por role_permissions sigue activo.
    expect(latest).toMatch(/role_permissions/i);
    // El bypass va EN OR antes del EXISTS (no atrapado en un branch no
    // ejecutable).
    expect(latest).toMatch(/has_role[\s\S]+OR[\s\S]+EXISTS/i);
  });
});
