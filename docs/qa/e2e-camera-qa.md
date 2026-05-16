# E2E — Camera QA harness

Cómo ejecutar la suite Playwright que valida el Interaction Kernel Pilot 1
(`camera-qa.spec.ts`, `preferences-runtime.spec.ts`) y el flujo de
autenticación (`auth.spec.ts`).

## Estructura

- `e2e/global-setup.ts` — autentica una vez y persiste el `storageState`
  en `e2e/.auth/user.json`. Lanza error claro si faltan credenciales.
- `playwright.config.ts` — define dos projects:
  - **`chromium-auth`** → solo `auth.spec.ts`. **No** usa `storageState`
    porque su contrato es probar el flujo unauthenticated.
  - **`chromium-app`** → resto de specs. Usa el `storageState` producido
    por `global-setup` para entrar a la app ya autenticado.
- `e2e/.auth/` está en `.gitignore`.

## Requisitos

- Node 20+.
- `npx playwright install chromium` (la primera vez).
- Un usuario de test existente en el backend Lovable Cloud del proyecto.
  Si no existe, créalo manualmente desde la app o vía la edge function
  `create-test-users`.

## Variables de entorno

| Variable                 | Obligatoria | Descripción                                          |
| ------------------------ | ----------- | ---------------------------------------------------- |
| `E2E_USER_EMAIL`         | sí          | Email del usuario de test                            |
| `E2E_USER_PASSWORD`      | sí          | Password del usuario de test                         |
| `PLAYWRIGHT_BASE_URL`    | no          | URL base. Default `http://localhost:5173` (dev)      |

Sin `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, `global-setup` aborta la suite
con un mensaje explícito (no hay skip silencioso).

## Ejecución local

```bash
export E2E_USER_EMAIL="tester@vandits.test"
export E2E_USER_PASSWORD="..."

# Toda la suite (auth + app)
npx playwright test

# Solo camera-qa
npx playwright test --project=chromium-app camera-qa.spec.ts

# Solo el flujo de auth (no requiere credenciales, pero global-setup las
# sigue exigiendo — pásalas igualmente o usa --project=chromium-auth con
# global-setup deshabilitado vía PWTEST_SKIP_GLOBAL_SETUP=1 si lo añades
# en el futuro).
npx playwright test --project=chromium-auth

# Modo debug (headed + inspector)
npx playwright test --project=chromium-app camera-qa.spec.ts --headed --debug

# Ver el último reporte HTML
npx playwright show-report
```

El `webServer` de la config arranca `npm run dev` automáticamente si no
hay un server escuchando en `http://localhost:5173`.

## Ejecución en CI

El workflow `.github/workflows/e2e.yml` ya pasa `E2E_USER_EMAIL` y
`E2E_USER_PASSWORD` como env del step `Run E2E tests`. Configurar los
secrets en **GitHub → Settings → Secrets and variables → Actions**:

- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`
- `VITE_SUPABASE_URL` (ya existía)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (ya existía)

Sin esos secrets, el job falla en `global-setup` con mensaje claro
indicando qué falta.

## Harness instrumental (`__exportCameraQa`)

`src/components/debug/camera-qa-globals.ts` instala en `window`:

- `__resetCameraQa()` — limpia métricas + trace, re-habilita el flag debug.
- `__startCameraCapture(label?)` — reset + stamp de `captureId`/`label`.
- `__exportCameraQa()` — devuelve snapshot JSON serializable con:
  - `metrics.totalRequests`, `byMode`, `byReason`, `unknownReasons`,
    `lastRequest`, `bypasses`, contadores de cooldown.
  - `trace` filtrada al rango del capture activo.

Los specs hacen `__startCameraCapture(label)` al inicio de cada test y
hacen aserciones sobre el snapshot final. El harness es inerte hasta que
se llama; seguro en producción.

## Selectores estables que usa la suite

- `#email`, `#password`, `button[type="submit"]` en `/auth` (login).
- `[data-testid="my-poi-trigger"]` — señal canónica de "app montada y
  sesión válida". Usada por `global-setup` para confirmar login y por
  `camera-qa.spec.ts` para abrir el popover.
- `[data-testid="filter-{all|enriched|imported|empty}"]` — filas del
  popover My Catalog.

Si alguno de estos selectores cambia, actualizar también este documento.

## Política de skips

`camera-qa.spec.ts` mantiene un `test.skip` defensivo si el trigger no
aparece (red de seguridad). Con `global-setup` configurado correctamente
ese skip **no debe disparar**: si lo hace, es señal de que el login falló
y hay que revisar credenciales / disponibilidad del backend.

## Relación con el Interaction Kernel Pilot 1

Esta infraestructura cierra la deuda de QA descrita en
[`docs/interaction-pilot-1-validation.md`](../interaction-pilot-1-validation.md).
Es prerequisito (gate) para arrancar Pilot 2.
