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
  Identidad canónica: `sandbox-agent@vandits.test`
  (uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb`, ver
  `mem://preferences/sandbox-user-mirror`).
  Si no existe — o no recuerdas su password — usa el script idempotente
  descrito en [§ Crear/resetear el usuario de test](#crearresetear-el-usuario-de-test).

## Crear/resetear el usuario de test

Las contraseñas de Supabase Auth no se pueden leer (ni siquiera con
service role); solo se pueden **escribir**. Hay dos vías idempotentes:

### Opción A — desde Lovable Cloud (recomendada, sin service_role local)

Esta es la vía usada para provisionar `sandbox-agent@vandits.test` en este
proyecto y **no requiere** que nadie maneje la service_role key fuera del
runtime gestionado.

1. En el agente, añade los dos secrets de runtime (formulario seguro):
   - `E2E_USER_EMAIL = sandbox-agent@vandits.test`
   - `E2E_USER_PASSWORD = <password fuerte>` (8+, may/min/num)
2. Despliega temporalmente la edge function `ensure-e2e-user` (lee solo
   esos dos secrets + la `SUPABASE_SERVICE_ROLE_KEY` autoinyectada por el
   runtime; no acepta body ni token).
3. Invoca `POST /functions/v1/ensure-e2e-user` sin body. Respuesta:
   `{ ok: true, action: "created"|"reset", uid, email }`.
4. Verifica login real con el anon key (REST `/auth/v1/token?grant_type=password`).
5. **Cleanup obligatorio**: borra la edge function y elimina los dos
   secrets de runtime (`E2E_USER_EMAIL`, `E2E_USER_PASSWORD` del runtime
   Lovable Cloud — NO los de GitHub Actions, que se mantienen).

La función es código desechable: no debe quedar desplegada entre runs.

### Opción B — script local (solo si tienes service_role)

Si tienes acceso directo al service_role key, `scripts/e2e/ensure-test-user.ts`
hace lo mismo desde tu máquina:

```bash
export SUPABASE_URL="https://nolmcafkzqwfmpleyfkx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # service_role, nunca commitear
export E2E_USER_EMAIL="sandbox-agent@vandits.test"
export E2E_USER_PASSWORD="SandboxAgent2026!"
bun run e2e:ensure-user
```

**Seguridad**:
- Nunca commitear la service_role key ni el password.
- GitHub Actions solo necesita `E2E_USER_EMAIL` y `E2E_USER_PASSWORD`
  (no la service_role).

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

## Fixture de catálogo del usuario E2E

`MyCatalogQuickFilters` aplica el contrato sistémico del kernel:
**`count === 0 && !active ⇒ disabled`** (sin false-affordance, ver
ADR-0004 y `mem://ui/selector-interaction-contract`). Por tanto, para que
la suite `Selector contract — filter-{imported,empty}` pueda hacer click
real (sin `force`, sin skips, sin debilitar el contrato), el usuario
`sandbox-agent@vandits.test` debe tener **≥1 POI en cada bucket de
`visualState`** (`enriched`, `imported`, `empty`).

`scripts/e2e/ensure-test-fixture.ts` garantiza esa precondición de forma
**idempotente** mediante upsert con IDs deterministas:

| Bucket   | ID estable                                      | Coordenadas        | Notas |
|----------|-------------------------------------------------|--------------------|-------|
| document | `f04b3b95-7308-4b74-b3c7-e2ed00000001`          | —                  | Documento contenedor (`source_type=manual`, `status=published`, `import_status=confirmed`). Propietario = sandbox user. |
| imported | `f04b3b95-7308-4b74-b3c7-e2e000000001`          | `40.4168, -3.7038` | `description` no vacío, `enriched_data=null`, `document_id` → fixture doc |
| empty    | `f04b3b95-7308-4b74-b3c7-e2e000000002`          | `40.4170, -3.7040` | `description=null`, `enriched_data=null`, `document_id` → fixture doc |
| enriched | (cualquiera de los 337 reales del catálogo)     | varias             | El usuario ya los tiene; no se tocan |

### Por qué los POIs DEBEN estar adjuntos a un documento

El popover `MyCatalogQuickFilters` calcula sus counts vía
`getMyCatalogQuickCounts(getAllLocations(), user.id)`. En el store
(`src/domains/content/store/locations-store.ts`), `getAllLocations()` se
define como:

```ts
getAllLocations: () => get().documents.flatMap(doc => doc.locations)
```

Es decir, **solo recorre el universo `documents[].locations`**. Los POIs
huérfanos (`document_id = NULL`) entran en el store por la vía paralela
`detachedVisibleLocations` y por tanto **son invisibles para los counts
del popover**. Resultado práctico: aunque el fixture exista en DB y en
`v_locations_resolved`, si `document_id` es nulo, `counts.imported === 0`
y la fila aparece como `data-state="disabled"` por el contrato sistémico
`count === 0 && !active ⇒ disabled` — Playwright rechaza el click y el
test rompe sin causa aparente.

Por eso el seed crea primero un documento fixture propiedad del sandbox
user y luego upsertea cada POI con `document_id` apuntando a ese
documento. Cualquier futuro fixture para `MyCatalogQuickFilters` debe
seguir la misma pauta.

Características clave:

- **Sin service_role**: el script autentica con `VITE_SUPABASE_PUBLISHABLE_KEY`
  + `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`. El upsert pasa la RLS porque
  `owner_user_id = auth.uid()`.
- **Sin destrucción**: nunca borra POIs `enriched` existentes ni toca
  ningún otro dato del usuario.
- **CI**: se ejecuta como step "Ensure E2E fixture …" en
  `.github/workflows/e2e.yml` antes de `npx playwright test`.
- **Local**:

  ```bash
  export VITE_SUPABASE_URL="https://nolmcafkzqwfmpleyfkx.supabase.co"
  export VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
  export E2E_USER_EMAIL="sandbox-agent@vandits.test"
  export E2E_USER_PASSWORD="..."
  bun scripts/e2e/ensure-test-fixture.ts   # o: npx tsx scripts/e2e/ensure-test-fixture.ts
  ```

Si en el futuro se añaden más buckets al popover (p.ej. nuevos
`healthFilter` agregados al contrato del selector), extender este fixture
con los IDs correspondientes — nunca debilitar el contrato del producto.

## Política de skips

`camera-qa.spec.ts` mantiene un `test.skip` defensivo si el trigger no
aparece (red de seguridad). Con `global-setup` configurado correctamente
ese skip **no debe disparar**: si lo hace, es señal de que el login falló
y hay que revisar credenciales / disponibilidad del backend.

## Relación con el Interaction Kernel Pilot 1

Esta infraestructura cierra la deuda de QA descrita en
[`docs/interaction-pilot-1-validation.md`](../interaction-pilot-1-validation.md).
Es prerequisito (gate) para arrancar Pilot 2.
