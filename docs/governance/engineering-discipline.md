# Engineering Discipline — NASA-grade

> Reglas inquebrantables sobre versionado, tests y desarrollo.
> Aplicar a TODO cambio. Sin excepciones. Sin "lo arreglo luego".

Espejo legible del canon registrado en `mem://governance/engineering-discipline`.

---

## 1. Versionado impecable

| Regla | Detalle |
|---|---|
| **SoT única** | `APP_VERSION` en `src/lib/app-version.ts`. Todo lo demás deriva o se valida contra ella. |
| **Parity test bloqueante** | `src/test/version-parity.test.ts`. Divergencia entre `package.json` / `README.md` / `version-history.md` y `APP_VERSION` ⇒ build rojo. |
| **Bump atómico** | `bun run scripts/release/bump-version.ts <patch\|minor\|major> "<descripción>"`. Nunca a mano. |
| **Semver estricto** | `patch` = fix/docs/refactor sin cambio API · `minor` = feature aditiva · `major` = breaking de canon |
| **Trazabilidad** | Cada bump genera entrada en `docs/releases/version-history.md` con scope + PR id + tag esperado. |
| **Git tag manual** | Tras merge: `git tag vX.Y.Z && git push --tags`. |

## 2. Tests impecables

| Regla | Detalle |
|---|---|
| **Rojo = bloqueante** | No se mergea con rojos. Punto. |
| **Diagnóstico antes de tocar** | Ante un rojo, decisión explícita: (a) código rompió contrato → fix código; (b) canon cambió → actualizar test + memoria + doc en mismo PR; (c) deuda real → `.skip` con `// TODO PR-XXX` + issue + memoria. |
| **Skip huérfano prohibido** | Todo `.skip` requiere referencia a PR e issue trazables. |
| **Contract tests = canon vivo** | Antes de relajar un assert, se actualiza la memoria/doc del canon. Nunca al revés. |
| **PR funcional ⇒ contract test** | Cada feature/refactor nuevo añade su test de contrato. |
| **Prohibido barrer rojos** | Poner CI verde sin entender el drift = anti-NASA. |

## 3. Desarrollo impecable

| Regla | Detalle |
|---|---|
| **Helpers únicos** | Cambios transversales en helpers centralizados (regla core multiusuario). Si no existe, crearlo primero. |
| **Flight readiness review** | Antes de tocar sistema crítico: leer memoria + contract tests + helpers afectados. |
| **Un PR = un grupo coherente** | Un commit limpio con tag de versión. Nada de megacommits. |
| **Memoria en el mismo PR** | Cambia el canon → actualiza la memoria en el mismo PR. Drift memoria↔código = rojo conceptual. |
| **Forense > arreglo a ciegas** | 3+ fallos relacionados ⇒ informe forense primero, fix después. |

## Postcondiciones obligatorias de cada PR

1. `bunx vitest run` verde (o rojos con `// TODO PR-XXX` registrados).
2. `version-parity.test.ts` verde.
3. `APP_VERSION` bumped si hay cambio funcional.
4. Memoria (`mem://`) actualizada si toca canon.
5. Commit message incluye versión final.

### Gate: rechazable **o corregible**

Un PR que incumple una postcondición **no se mergea como está**, pero el flujo por defecto es **corregir en el mismo PR** (bump faltante, memoria desincronizada, test rojo sin ticket, parity rota). El rechazo definitivo sólo procede si el autor se niega a corregir o el incumplimiento es estructural.

Orden de actuación:
1. **Diagnóstico** — ¿qué postcondición falla y por qué?
2. **Corrección en el mismo PR** — bump, sync de memoria, fix de test o ticket de skip.
3. **Re-verificar las 5 postcondiciones** — todas verdes antes de mergear.
4. **Rechazo** — sólo si (2) no es posible o el autor lo bloquea.

---

**Referencia cruzada**:
- `docs/versioning.md` — mecánica del bump
- `mem://governance/engineering-discipline` — canon
- `src/test/version-parity.test.ts` — guardia automática
