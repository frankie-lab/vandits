# PR-PROCESS-DISCOVERY-1 — Lovable ↔ GitHub ↔ CI

Reporte de diagnóstico. **No se ha tocado código de producto, ni se ha publicado, ni se ha abierto PR.** Solo lecturas de estado.

---

## 1. Estado de GitHub

| Campo | Valor |
|---|---|
| Repo conectado | sí, vía Lovable GitHub App (remote `origin` apunta al storage gestionado de Lovable; el espejo en GitHub.com se sincroniza desde ahí) |
| Default branch | `main` |
| Último SHA en `main` (fetched ahora) | `a4e0294d` — "Implementó PR-INLINE-3.1" |
| Workflows existentes | `.github/workflows/unit.yml`, `.github/workflows/e2e.yml` |
| Trigger `unit.yml` | `push` a `main` + `pull_request` contra `main` |
| Trigger `e2e.yml` | `push` a `main` + `pull_request` contra `main` |
| ¿E2E corre Playwright real? | **Condicional.** Gate `secrets_gate` comprueba `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`. Si falta cualquiera ⇒ workflow termina **verde con `::warning::`**, sin instalar Playwright ni correr tests. Si están todos ⇒ build + fixture + `npx playwright test`. |
| ¿E2E verde implica E2E pasada? | **NO.** Verde puede significar "skipped por falta de secrets". Hay que mirar el step `Check E2E secrets availability` para saber `should_run=true|false`. |
| Required checks (branch protection en `main`) | **No verificable desde el sandbox** (no hay acceso a la API de GitHub para leer protections). Hay que mirarlo en GitHub → Settings → Branches. |

---

## 2. Estado de Lovable

| Campo | Valor |
|---|---|
| Proyecto Lovable ID | `0d7813f2-83f2-4ee7-9dde-6d8979ed799d` |
| Branch actual del sandbox | `edit/edt-fc04534e-ca3c-4c1b-8c88-a19ba135760e` (**branch sandbox auto-generada, distinta de la `edt-65101165` que se dio por contaminada — esta es nueva pero ya acumula 333 commits propios**) |
| SHA actual del sandbox | `5778d1dd` — "Propuso split por dominio" |
| Commits ahead de `origin/main` | **333** |
| Commits behind de `origin/main` | 0 |
| ¿Es `edit/edt-*`? | sí (formato `edit/edt-<uuid>`, generado por Lovable, no nombrada por usuario) |
| ¿Branch picker visible? | sí, según docs: **Project settings → GitHub → branch picker** (desktop y mobile) |
| ¿Permite cambiar a `main`? | sí, desde el branch picker; al cambiar, el sandbox empieza a editar/sincronizar esa branch |
| ¿Permite crear branch nueva desde `main`? | sí: cambiar primero a `main`, luego **+ Create branch** en el branch picker |
| ¿"New branch per task/update"? | **No documentado como toggle**. El default es crear/seguir una `edit/edt-*` por sesión, no por tarea. Para "una rama por tarea" hay que crearla **manualmente** desde el branch picker antes de cada tarea. |
| ¿Publish hace push a `main`? | **No directamente.** Publish despliega un snapshot del sandbox a la URL pública (`vandits.lovable.app`). El push a GitHub ocurre de forma continua e independiente, **a la branch activa del sandbox**, no a `main`. |

---

## 3. Estado de sync

- **Cuándo Lovable crea commit**: tras cada turno del agente que escribe archivos (commits automáticos tipo "Changes", "Implementó X").
- **Cuándo Lovable pushea a GitHub**: en tiempo real, junto con el commit, a la **branch activa del sandbox** (hoy `edit/edt-fc04534e…`).
- **A qué branch pushea**: a la branch seleccionada en el branch picker. **Nunca pushea a `main` desde el sandbox a menos que la branch activa sea `main`.**
- **Qué hace Publish**: despliega el estado del sandbox a la URL pública (`*.lovable.app` y dominio custom). **No fusiona la branch a `main`.** No abre PR.
- **¿Publish dispara GitHub Actions?**: indirectamente sólo si la branch activa es `main` (push to main ⇒ Actions). Desde una `edit/edt-*`, los workflows actuales **no se disparan** (sus triggers son `push: main` y `pull_request: main`). Para correr CI desde una `edit/edt-*` hay que abrir un PR contra `main`.
- **¿El sandbox se sincroniza desde `main` cuando `main` cambia?**: sólo si la branch activa del sandbox **es** `main`. Si estás en `edit/edt-*`, los cambios en `main` no entran automáticamente.
- **Drift / branch contaminada**: si la branch activa acumula muchos commits y se quiere descartar, la vía documentada es **cambiar el branch picker a `main`** y, si hace falta, crear branch nueva desde ahí. La branch contaminada queda en GitHub como rama abandonada (se puede borrar desde GitHub web).

---

## 4. Modos de trabajo posibles

| Modo | ¿Existe? | Cómo se activa | Limitaciones | ¿Dispara CI? | Riesgo |
|---|---|---|---|---|---|
| **A. Trabajo directo sobre `main`** | Sí | Branch picker → `main` | Cada commit del agente va directo a producción de la SoT; no hay PR review; CI corre pero post-merge | Sí (push a `main`) | **Alto**: sin revisión, sin PR, sin posibilidad de rechazo |
| **B. Rama `edit/*` acumulativa** | Sí (default actual) | No hacer nada — Lovable la crea | Tiende a mezclar dominios; difícil de splittear; ya bloqueó la branch previa | **No** (workflows no escuchan `edit/*`) hasta abrir PR | **Alto**: es lo que nos trajo aquí |
| **C. Rama nueva por tarea desde `main`** | Sí | Branch picker → `main` → **+ Create branch** con nombre tipo `pr/ci-infra-1` | Requiere acción manual del usuario antes de cada tarea | Sólo cuando se abra PR contra `main` | Bajo |
| **D. PR automático desde Lovable** | **No documentado.** Lovable no abre PR por sí solo | — | — | — | — |
| **E. PR manual en GitHub** | Sí | GitHub web → Pull requests → New → `base: main`, `compare: <branch>` | Requiere salir de Lovable a GitHub | Sí (al abrir PR) | Bajo |
| **F. Publish directo** | Sí | Botón Publish | Despliega snapshot de la branch activa a URL pública; **no fusiona a `main`** | No (salvo branch activa = main) | Medio: publica sin pasar por main/CI |
| **G. Proyecto/remix nuevo** | Sí | Dashboard → remix; o crear proyecto y copiar código | Pierde historial de chat; hay que reconectar Cloud/secrets | N/A | Bajo, pero costoso |

---

## 5. Procedimiento recomendado (sin terminal)

**Antes de cada nueva tarea:**

1. **Abrir Project settings → GitHub** (branch picker).
2. Verificar que el picker muestra la branch actual. **Si dice `edit/edt-*`, NO empezar la tarea ahí.**
3. **Cambiar a `main`**. Esperar a que el sandbox indique "synced".
4. En el branch picker, **+ Create branch** con nombre semántico: `pr/<dominio>-<n>` (ej. `pr/ci-infra-1`, `pr/security-edge-auth-1`).
5. Confirmar que el branch picker ahora muestra la nueva rama y que está **0 commits ahead/behind de `main`** (sandbox limpio).
6. Decir al agente la tarea. **Una tarea = una rama.**

**Al terminar la tarea:**

7. Revisar en GitHub.com que la rama existe y contiene sólo los commits esperados.
8. **Abrir PR manual en GitHub web**: `base: main`, `compare: pr/<dominio>-<n>`.
9. Esperar a que corran **`unit.yml`** y **`e2e.yml`**.
10. **Inspeccionar el step `Check E2E secrets availability`** del job e2e:
    - Si `should_run=true` y el job es verde ⇒ E2E pasada.
    - Si `should_run=false` ⇒ **E2E skipped, NO cuenta como verde**.
11. Merge **sólo** si: unit verde + (e2e real verde **o** explícitamente aceptado como skipped por política).
12. Anotar SHA final en `main` tras el merge.

---

## 6. Política obligatoria (propuesta para ratificar)

1. **Una tarea = una rama nueva desde `main`.** Nombre `pr/<dominio>-<n>`.
2. **Prohibido trabajar sobre `edit/edt-*` acumulativa.** Si Lovable está en `edit/*`, parar y aplicar el procedimiento de §5 pasos 1–5.
3. **No cerrar tarea sin SHA en `main`** (tras merge del PR).
4. **No cerrar tarea sin Actions verdes** (unit obligatorio; e2e según política).
5. **No publicar (`Publish`) si la branch activa mezcla dominios o no es `main` mergeado.**
6. **E2E "skipped" ≠ E2E verde.** Si `should_run=false`, el PR no se considera con cobertura E2E.
7. **Si el branch picker no permite crear rama desde `main`** (UI ausente / bug), parar y abrir ticket de soporte. No improvisar.
8. **Branches `edit/edt-*` contaminadas se abandonan** (no se mergean, no se publican). Se borran desde GitHub web cuando ya no estorben.

---

## 7. Checklists

### Checklist ANTES de empezar PR

- [ ] Branch picker → `main` seleccionado y sandbox "synced"
- [ ] `+ Create branch` con nombre `pr/<dominio>-<n>`
- [ ] Nueva rama 0 ahead / 0 behind de `main`
- [ ] Alcance de la tarea declarado (un único dominio)
- [ ] Workflows requeridos identificados (`unit.yml` siempre; `e2e.yml` si toca UI/flow)

### Checklist de CIERRE de PR

- [ ] PR abierto en GitHub web con `base: main`
- [ ] `unit.yml` verde
- [ ] `e2e.yml` verde **y** step `Check E2E secrets availability` muestra `should_run=true` (o se acepta skip explícitamente)
- [ ] Diff revisado: sólo el dominio declarado
- [ ] Merge realizado
- [ ] SHA final en `main` anotado en el cierre
- [ ] Si aplica: bump de versión / memoria sólo después del merge, en un PR separado

---

## 8. Estado actual vs criterio de cierre

| Pregunta del criterio | Respuesta |
|---|---|
| ¿Cómo crear una rama limpia desde `main`? | Branch picker → cambiar a `main` → **+ Create branch** |
| ¿Lovable puede hacerlo automáticamente? | **No por defecto.** Lovable crea `edit/edt-*` automáticas, no `pr/<dominio>-*`. La creación de rama por tarea es **acción manual** del usuario en el branch picker. |
| ¿Qué hace `Publish`? | Despliega snapshot de la branch activa a URL pública. **No fusiona a `main`. No abre PR.** Sólo dispara Actions si la branch activa es `main`. |
| ¿Cómo se disparan tests? | `push` o `pull_request` contra `main`. Desde `edit/edt-*` la única vía es abrir PR contra `main`. |
| ¿Qué debe mirar el usuario? | (a) Branch picker antes de empezar; (b) en GitHub Actions, el step `Check E2E secrets availability` para distinguir E2E real vs skipped; (c) SHA en `main` tras merge. |
| ¿Cuándo parar? | Si branch activa = `edit/edt-*` y se va a empezar tarea nueva → parar y aplicar §5. Si E2E sale verde pero `should_run=false` y se requería cobertura E2E → parar. Si branch picker no permite crear desde `main` → parar y abrir soporte. |

---

## 9. Hechos del sandbox actual (snapshot)

- Branch activa: `edit/edt-fc04534e-ca3c-4c1b-8c88-a19ba135760e`
- SHA sandbox: `5778d1dd`
- SHA `origin/main`: `a4e0294d`
- Ahead/behind: `333 / 0`
- **Conclusión:** este sandbox **NO debe usarse para implementar PR-CI-INFRA-1 ni ninguna otra tarea trazable**. Está en la misma situación operativa que la branch previa que se declaró no integrable. La siguiente acción del usuario debe ser §5 pasos 1–5 (cambiar branch picker a `main` + crear `pr/ci-infra-1`).
