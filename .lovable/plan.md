
# Plan NASA-grade para Versionado

## Diagnóstico

Hay **5 lugares** donde aparece la versión, y **3 están divergentes**:

| Sitio | Valor actual | Estado |
|---|---|---|
| `package.json` → `version` | `1.4.4` | OK (SoT de release) |
| `src/lib/app-version.ts` → `APP_VERSION` | `1.4.4` | OK (SoT de runtime) |
| `docs/releases/version-history.md` | hasta `1.4.4` | OK (histórico oficial) |
| `src/lib/version.ts` → `changelog` (string hardcodeado) | corta en `v1.1.1` | **DIVERGENTE** |
| `README.md` (sección changelog) | corta en `v1.2.8`, mezcla cronológica | **DIVERGENTE** |
| `VANDITS-v2.0-DOCUMENTATION.md` | `v2.0` (legacy aspiracional) | **HUÉRFANO** |

Causa raíz del "Claude lee 1.1.1": un agente externo que clona el repo abre `src/lib/version.ts` (nombre prometedor) o el primer `## v…` que ve en README y obtiene una versión fósil.

Además: **no existe tag `v1.4.4` en GitHub** y no hay guard en CI que detecte divergencia (la política ya está escrita en `docs/versioning.md` y `docs/contracts/release-versioning-policy.md`, pero no se enforce).

## Principio rector

> **Una sola fuente de verdad de versión: `src/lib/app-version.ts`.**
> Todo lo demás se deriva o se valida contra ella por CI.
> Divergencia = build rojo. Sin excepción.

## Cambios

### 1. Colapsar el SoT runtime (un único fichero)

- Borrar la duplicación en `src/lib/version.ts`: eliminar el campo `changelog` hardcodeado (es la fuente del "v1.1.1"). El changelog vive **únicamente** en `docs/releases/version-history.md`.
- `version.ts` queda como re-export delgado de `app-version.ts` + metadata estática (nombre, build date). Sin literales de versión.
- Documentar en cabecera del fichero: "SoT = `app-version.ts`. No editar `APP_VERSION` aquí."

### 2. Reescribir el changelog del README

- Reemplazar la sección changelog del README por un **bloque generado**: solo las últimas 5 versiones, en orden cronológico inverso estricto, extraídas de `docs/releases/version-history.md`.
- Bajo el bloque, un enlace "Histórico completo → `docs/releases/version-history.md`".
- Reordenar correctamente (hoy v1.1.1 aparece entre v1.2.0 y v1.1.0, lo cual es un bug semántico).

### 3. Sincronizar `docs/releases/version-history.md`

- Verificar que la última entrada coincide con `APP_VERSION`. Hoy = 1.4.4 ✓.
- Añadir tabla resumen al inicio con `current = 1.4.4`, `previous_stable = 1.4.3`, fecha, tag git esperado.

### 4. Archivar el fichero huérfano

- Mover `VANDITS-v2.0-DOCUMENTATION.md` a `docs/_archive/` con una nota: "documento aspiracional v2.0, no refleja release actual".

### 5. Guard de CI: parity test

Añadir `src/test/version-parity.test.ts` (vitest, sin secrets, corre en `unit.yml`) que verifica:

1. `APP_VERSION` (de `app-version.ts`) === `package.json.version`.
2. Última entrada de `docs/releases/version-history.md` (parseada por regex `^\|\s*(\d+\.\d+\.\d+)\s*\|`) === `APP_VERSION`.
3. Última entrada `### v…` del README === `APP_VERSION`.
4. El semver es válido (`/^\d+\.\d+\.\d+(-[\w.]+)?$/`).
5. `src/lib/version.ts` no contiene literales `v\d+\.\d+\.\d+` (anti-regresión del campo `changelog`).

Cualquier divergencia → test rojo → build rojo. Mensaje del test explica qué fichero actualizar.

### 6. Script de release (one-shot, idempotente)

`scripts/release/bump-version.ts`:

```text
bun scripts/release/bump-version.ts patch "PR-XYZ — descripción corta"
```

Acciones:
1. Lee `APP_VERSION` actual, calcula nueva según `patch|minor|major`.
2. Escribe la nueva versión en `package.json` y `src/lib/app-version.ts` atómicamente.
3. Añade entrada a `docs/releases/version-history.md` con timestamp UTC.
4. Añade `### vX.Y.Z` al README (al inicio del bloque changelog).
5. Imprime el comando git tag para que el operador lo ejecute manualmente: `git tag vX.Y.Z && git push --tags`.

Esto cierra el bucle: **el operador nunca toca versiones a mano**.

### 7. Tag git de la versión actual

Acción manual del usuario tras el merge: `git tag v1.4.4 -m "Current stable" && git push origin v1.4.4`. Lo documento al final, no lo puedo hacer yo desde aquí.

### 8. Documentar el nuevo flujo

Actualizar `docs/versioning.md` sección "Fuentes de verdad" para reflejar el SoT único + el script + el parity test. Eliminar la mención a editar `changelog` en `version.ts`.

## Detalles técnicos

- El parity test del README parsea solo los `### v…` (h3). El script de release inserta siempre en formato `### vX.Y.Z (YYYY-MM-DD)\n- línea\n\n`.
- El parser de `version-history.md` busca la tabla `| version | date | status | ...` y toma la fila con `status` que contenga `current` o, en su defecto, la fila con versión más alta por orden semver.
- Ningún cambio en runtime, schema, RBAC, popups, mapa, edge functions. Solo metadata + tests + docs + script.
- `VANDITS-v2.0-DOCUMENTATION.md` no se borra (puede tener valor histórico) — se archiva en `docs/_archive/` con nota.

## Impacto de versión

`bump:patch` → `1.4.4 → 1.4.5`, etiquetado **"versioning hardening — parity test + single SoT"**.

## Postcondición verificable

- `npm test` rojo si alguien toca `APP_VERSION` sin sincronizar README + version-history.
- `npm test` rojo si alguien reintroduce un literal `v1.x.y` en `src/lib/version.ts`.
- Cualquier agente externo (Claude, Copilot, humano) que clone el repo y abra `src/lib/app-version.ts`, `package.json` o el README ve la **misma versión**.
- Existe tag `v1.4.5` en GitHub.

