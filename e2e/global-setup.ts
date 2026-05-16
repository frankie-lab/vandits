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
 * Estrategia de login (multi-señal post-submit):
 *   1. Navega a `/auth` y espera a que el form esté visible.
 *   2. Rellena testids `auth-email` / `auth-password` y submit.
 *   3. Carrera entre cuatro señales:
 *        a) URL fuera de `/auth`
 *        b) `[data-testid="my-poi-trigger"]` visible
 *        c) clave Supabase `sb-*-auth-token` en localStorage
 *        d) toast `sonner` de error → throw con mensaje del toast
 *   4. Guarda storageState.
 *
 * Diagnóstico (sin nunca imprimir password/access_token/refresh_token):
 *   - Captura respuestas /auth/v1/ con status + JSON sanitizado.
 *   - Compara project ref del publishable JWT vs host de VITE_SUPABASE_URL.
 *   - Dump completo en catch: url, title, body, #root, errores consola/page,
 *     authResponses, sbKeys de localStorage, toasts visibles.
 */

import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STORAGE_STATE_PATH = resolve(__dirname, '.auth/user.json');

/** Campos sensibles que NUNCA deben aparecer en logs. */
const SENSITIVE_KEYS = new Set([
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'password',
  'new_password',
]);

function sanitizeAuthBody(raw: string): string {
  const trimmed = raw.slice(0, 800);
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (SENSITIVE_KEYS.has(k)) {
          clean[k] = '<redacted>';
        } else if (k === 'user' && v && typeof v === 'object') {
          // Mantener sólo identificadores no sensibles.
          const u = v as Record<string, unknown>;
          clean.user = {
            id: u.id,
            email: u.email,
            email_confirmed_at: u.email_confirmed_at,
            confirmed_at: u.confirmed_at,
          };
        } else {
          clean[k] = v;
        }
      }
      return JSON.stringify(clean);
    }
  } catch {
    // No JSON — devolver texto plano truncado, asumiendo que no incluye
    // tokens (los endpoints /auth/v1/ devuelven JSON en errores y éxito).
  }
  return trimmed;
}

/** Decodifica el payload de un JWT sin verificar firma. */
function decodeJwtPayload(jwt: string | undefined): Record<string, unknown> | null {
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function diagnoseProjectAlignment(): string {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const hostMatch = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const urlRef = hostMatch?.[1] ?? null;
  const payload = decodeJwtPayload(key);
  const jwtRef = (payload?.ref as string | undefined) ?? null;
  const role = (payload?.role as string | undefined) ?? null;

  if (!url) return 'project-alignment: VITE_SUPABASE_URL no está en el entorno del runner';
  if (!key) return 'project-alignment: VITE_SUPABASE_PUBLISHABLE_KEY no está en el entorno del runner';
  if (!urlRef) return `project-alignment: VITE_SUPABASE_URL "${url}" no tiene el formato <ref>.supabase.co`;
  if (!jwtRef) return 'project-alignment: publishable key no es un JWT válido (no se pudo leer payload.ref)';
  if (role && role !== 'anon') {
    return `project-alignment: WARNING role=${role} (esperado "anon") — ¿se está usando service_role por error?`;
  }
  if (urlRef !== jwtRef) {
    return `project-alignment: MISMATCH — URL apunta a project "${urlRef}" pero publishable key pertenece a project "${jwtRef}". Sincroniza secrets.`;
  }
  return `project-alignment: OK (project=${urlRef}, role=${role ?? 'unknown'})`;
}

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

  const alignment = diagnoseProjectAlignment();
  console.error(`[e2e/global-setup] ${alignment}`);

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const authResponses: Array<{ status: number; url: string; body: string }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
      console.error(`[browser console.error] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    const text = err.message;
    pageErrors.push(text);
    console.error(`[browser pageerror] ${text}`);
  });

  // Capturar respuestas de Supabase Auth (sanitizadas).
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/auth/v1/')) return;
    const status = response.status();
    let body = '';
    try {
      const raw = await response.text();
      body = sanitizeAuthBody(raw);
    } catch {
      body = '<body unreadable>';
    }
    authResponses.push({ status, url, body });
    console.error(`[auth response] ${status} ${url} :: ${body}`);
  });

  try {
    await page.goto(`${baseURL}/auth`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="auth-login-form"]', {
      state: 'visible',
      timeout: 30_000,
    });

    const emailField = page.getByTestId('auth-email');
    const passwordField = page.getByTestId('auth-password');
    const submitButton = page.getByTestId('auth-submit');

    await emailField.waitFor({ state: 'visible', timeout: 10_000 });
    await emailField.fill(email);
    await passwordField.fill(password);

    // Toast de error de sonner. Si aparece, gana la carrera y abortamos.
    const errorToast = page
      .locator('[data-sonner-toast][data-type="error"]')
      .first();

    await submitButton.click();

    // Espera multi-señal: la primera que resuelva manda.
    const successSignal = (async () => {
      const winner = await Promise.race([
        page
          .waitForURL((u) => !/\/auth(\b|\/|\?|$)/.test(u.toString()), {
            timeout: 30_000,
          })
          .then(() => 'url-changed' as const),
        page
          .getByTestId('my-poi-trigger')
          .waitFor({ state: 'visible', timeout: 30_000 })
          .then(() => 'my-poi-trigger' as const),
        page
          .waitForFunction(
            () => {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
                  return true;
                }
              }
              return false;
            },
            null,
            { timeout: 30_000 },
          )
          .then(() => 'sb-auth-token' as const),
      ]);
      return winner;
    })();

    const failureSignal = errorToast
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(async () => {
        const text = await errorToast.innerText().catch(() => '<no toast text>');
        throw new Error(`Auth UI mostró toast de error: ${text.trim()}`);
      });

    const winner = await Promise.race([successSignal, failureSignal]);
    console.error(`[e2e/global-setup] login success signal=${winner}`);

    // Asegurar que la app principal está montada antes de guardar state.
    await page.waitForSelector('[data-testid="my-poi-trigger"]', {
      state: 'visible',
      timeout: 30_000,
    });

    await context.storageState({ path: STORAGE_STATE_PATH });
  } catch (err) {
    let diag = '';
    try {
      const url = page.url();
      const title = await page.title().catch(() => '<no title>');
      const bodyText = await page
        .locator('body')
        .innerText({ timeout: 2_000 })
        .catch(() => '<no body>');
      const rootInfo = await page
        .evaluate(() => {
          const root = document.querySelector('#root');
          return {
            exists: !!root,
            childCount: root?.childElementCount ?? 0,
            innerHtmlExcerpt: root?.innerHTML.slice(0, 1000) ?? '<no #root>',
          };
        })
        .catch(() => ({
          exists: false,
          childCount: 0,
          innerHtmlExcerpt: '<evaluate failed>',
        }));
      const sbKeys = await page
        .evaluate(() => {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('sb-')) keys.push(k);
          }
          return keys;
        })
        .catch(() => [] as string[]);
      const toastsText = await page
        .locator('[data-sonner-toast]')
        .allInnerTexts()
        .catch(() => [] as string[]);

      const authSummary =
        authResponses.length === 0
          ? '<none>'
          : authResponses
              .slice(0, 10)
              .map((r) => `${r.status} ${r.url} :: ${r.body}`)
              .join(' || ');

      diag =
        `\n  ${alignment}` +
        `\n  current url: ${url}` +
        `\n  page title: ${title}` +
        `\n  body excerpt: ${bodyText.slice(0, 500).replace(/\s+/g, ' ') || '<empty>'}` +
        `\n  #root exists: ${rootInfo.exists} (children=${rootInfo.childCount})` +
        `\n  #root innerHTML excerpt: ${rootInfo.innerHtmlExcerpt.replace(/\s+/g, ' ')}` +
        `\n  localStorage sb-* keys: ${sbKeys.length === 0 ? '<none>' : sbKeys.join(', ')}` +
        `\n  visible toasts (${toastsText.length}): ${toastsText.map((t) => t.replace(/\s+/g, ' ')).join(' | ') || '<none>'}` +
        `\n  console errors (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(' | ') || '<none>'}` +
        `\n  page errors (${pageErrors.length}): ${pageErrors.slice(0, 5).join(' | ') || '<none>'}` +
        `\n  auth responses (${authResponses.length}): ${authSummary}`;
    } catch {
      // ignore diagnostic failures
    }
    throw new Error(
      `[e2e/global-setup] Login falló: ${(err as Error).message}\n` +
        `Verifica que el usuario ${email} existe en el project Supabase configurado y que el server está disponible en ${baseURL}.` +
        diag,
    );
  } finally {
    await browser.close();
  }
}

export { STORAGE_STATE_PATH };
