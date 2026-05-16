/**
 * e2e/global-setup.ts
 *
 * Playwright global setup — autentica una vez al inicio de la suite y
 * persiste el `storageState` resultante en `e2e/.auth/user.json`.
 *
 * Variables de entorno requeridas:
 *   - E2E_USER_EMAIL    → email del usuario de test
 *   - E2E_USER_PASSWORD → password del usuario de test
 *
 * Opcional:
 *   - PLAYWRIGHT_BASE_URL (fallback: http://localhost:5173)
 *
 * Si faltan credenciales, este setup lanza un error claro y la suite no
 * arranca. El project `chromium-auth` (que prueba el flujo unauthenticated)
 * no usa este storageState y por tanto no se ve afectado por la sesión.
 *
 * Estrategia de login:
 *   1. Navega a `/auth`
 *   2. Rellena `#email` y `#password` (ids estables presentes en Auth.tsx)
 *   3. Hace click en el botón "Iniciar Sesión" (form submit)
 *   4. Espera a que `[data-testid="my-poi-trigger"]` sea visible en `/`
 *      (señal canónica de sesión válida usada por camera-qa.spec.ts)
 *   5. Guarda storageState
 */

import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STORAGE_STATE_PATH = resolve(__dirname, '.auth/user.json');

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      [
        '[e2e/global-setup] Faltan credenciales para autenticar la suite.',
        'Define las variables de entorno:',
        '  - E2E_USER_EMAIL',
        '  - E2E_USER_PASSWORD',
        '',
        'Local: exportalas en tu shell antes de `npx playwright test`.',
        'CI: añádelas como GitHub Secrets y mapéalas en .github/workflows/e2e.yml.',
        '',
        'Ver docs/qa/e2e-camera-qa.md para más detalle.',
      ].join('\n'),
    );
  }

  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'http://localhost:5173';

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/auth`, { waitUntil: 'domcontentloaded' });

    // Asegurar que estamos en modo login (es el default, pero por si acaso
    // venimos de una redirección con ?mode=signup).
    const loginTab = page.getByRole('button', { name: /iniciar sesión/i }).first();
    if (await loginTab.isVisible().catch(() => false)) {
      await loginTab.click().catch(() => undefined);
    }

    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);

    // Submit. El form tiene un solo submit visible con label "Iniciar Sesión".
    await Promise.all([
      page
        .locator('button[type="submit"]')
        .filter({ hasText: /iniciar sesión/i })
        .first()
        .click(),
      page.waitForURL((url) => !/\/auth(\b|\/|\?|$)/.test(url.toString()), {
        timeout: 15_000,
      }),
    ]);

    // Señal canónica de sesión válida y app montada.
    await page.waitForSelector('[data-testid="my-poi-trigger"]', {
      state: 'visible',
      timeout: 20_000,
    });

    await context.storageState({ path: STORAGE_STATE_PATH });
  } catch (err) {
    throw new Error(
      `[e2e/global-setup] Login falló: ${(err as Error).message}\n` +
        `Verifica que el usuario ${email} existe y que el dev server está disponible en ${baseURL}.`,
    );
  } finally {
    await browser.close();
  }
}

export { STORAGE_STATE_PATH };
