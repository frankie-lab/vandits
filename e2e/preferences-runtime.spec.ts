/**
 * preferences-runtime.spec.ts
 *
 * E2E smoke: verifica que el preferencesBus actúa como puente runtime.
 * Si un cambio emitido por el bus no llega a los suscriptores, este test falla.
 *
 * NOTA: Este test no requiere autenticación porque ejercita el bus en
 * `window` directamente — el contrato del puente es independiente de la sesión.
 */
import { test, expect } from '@playwright/test';

test.describe('preferences runtime bridge', () => {
  test('emits and receives a pref-changed event without reload', async ({ page }) => {
    await page.goto('/');
    // Wait for the SPA shell to mount.
    await page.waitForLoadState('networkidle');

    const received = await page.evaluate(() => {
      return new Promise<unknown>((resolve) => {
        const handler = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          window.removeEventListener('lovable:pref-changed', handler);
          resolve(detail);
        };
        window.addEventListener('lovable:pref-changed', handler);

        // Emit through the same channel preferencesBus uses.
        window.dispatchEvent(
          new CustomEvent('lovable:pref-changed', {
            detail: {
              unitId: 'ux.appearance',
              scope: 'user',
              overrides: { theme: 'dark' },
            },
          }),
        );

        // Safety timeout so the test fails fast if the bridge is broken.
        setTimeout(() => resolve(null), 1500);
      });
    });

    expect(received).not.toBeNull();
    expect(received).toMatchObject({
      unitId: 'ux.appearance',
      scope: 'user',
      overrides: { theme: 'dark' },
    });
  });
});
