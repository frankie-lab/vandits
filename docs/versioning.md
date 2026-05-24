# Vandits Versioning Policy

Estado: activo — 2026-05-19

Vandits adopta **Semantic Versioning** (SemVer) en formato `MAJOR.MINOR.PATCH`.
Esta política define qué tipo de cambio justifica cada nivel y cómo se gestionan
prereleases, fuentes de verdad y checklist de release.

---

## Niveles

### PATCH (`x.y.Z`)

Cambios que **no alteran capacidad funcional observable** ni rompen contratos.

Criterios:

- Bugfixes.
- Tests (nuevos o ampliados).
- Documentación.
- Ajustes visuales pequeños sin cambio de comportamiento.
- Refactors internos sin cambio observable.
- Alineación entre `package.json`, README y changelog.
- Reducción de deuda técnica sin cambio funcional.

Ejemplos Vandits:

- Tests para `src/domains/content/lib/point-visual-state.ts`.
- Documentación de eventos globales (`docs/architecture/global-events.md`).
- Null safety de popups.
- Actualización de `docs/tech-debt.md`.

### MINOR (`x.Y.0`)

Nueva capacidad funcional **compatible**: añade superficie sin romper la existente.

Criterios:

- Nuevo flujo de usuario relevante.
- Nuevo módulo o dominio.
- Nuevas acciones de popup.
- Nuevas capas de mapa.
- Rutas / itinerarios.
- Mejoras relevantes de producto sin ruptura.

Ejemplos Vandits:

- Rutas e itinerarios.
- Alternativas intermodales.
- Nuevo sistema de catálogo.
- Nuevo flujo de enriquecimiento.
- Nueva experiencia social.

### MAJOR (`X.0.0`)

Ruptura de contrato, arquitectura o expectativa funcional.

Criterios:

- Cambio profundo de modelo de datos.
- Reemplazo incompatible del bus global de eventos.
- Reestructuración profunda de `LocationMap`.
- Cambio incompatible del contrato canónico de popup.
- Migración incompatible de documentos, rutas o catálogo.

---

## Prereleases

Se admiten sufijos para versiones no estables:

- `alpha` — prototipo, contrato sujeto a cambio sin aviso.
- `beta` — superficie estable, en validación.
- `rc` — release candidate, sin cambios funcionales previstos.
- `stable` — publicado (sin sufijo).

Ejemplos:

```text
1.2.0-alpha.1
1.2.0-beta.1
1.2.0-rc.1
1.2.0
```

---

## Fuentes de verdad

**Single Source of Truth (SoT) canónica de la versión publicada:**

```
src/lib/app-version.ts → APP_VERSION
```

Todas las demás superficies se derivan o se validan contra ella:

| Superficie | Regla |
|---|---|
| `package.json` → `version` | Debe coincidir con `APP_VERSION`. |
| `README.md` título `# VANDITS vX.Y.Z` | Debe coincidir con `APP_VERSION`. |
| `README.md` badge `VANDITS-vX.Y.Z-blue` | Debe coincidir con `APP_VERSION`. |
| `README.md` sección Changelog (entrada superior `### vX.Y.Z`) | Debe coincidir con `APP_VERSION`. |
| `docs/releases/version-history.md` fila inferior del árbol `1.x` | Debe coincidir con `APP_VERSION`. |
| `docs/tech-debt.md` | Se actualiza solo si el release resuelve o crea deuda. |

**Enforcement automático**: el contract test
`src/test/version-parity.test.ts` (corre en `unit.yml`, sin secrets) hace
build rojo ante cualquier divergencia, incluida la reintroducción de
literales `vX.Y.Z` hardcodeados en `src/lib/version.ts` (regresión
histórica que arrastraba `v1.1.1`).

**Cómo hacer un bump**: NUNCA editar `APP_VERSION` ni el README a mano.
Usar el script idempotente:

```text
bun scripts/release/bump-version.ts <patch|minor|major> "PR-XYZ — nota"
```

El script actualiza atómicamente los 4 ficheros y deja indicado el
comando `git tag` que el operador debe ejecutar (los tags se crean fuera
de Lovable).

La versión visible en el UX principal se muestra debajo del logo VANDITS
y debe consumir `APP_VERSION` / `APP_VERSION_LABEL`. Está PROHIBIDO
hardcodear `vX.Y.Z` en componentes de UI o en cualquier fichero de
`src/lib/version.ts`.



---

## Regla de decisión rápida

```text
¿Rompe contratos o expectativas?
  sí → MAJOR
  no → ¿añade capacidad funcional relevante?
          sí → MINOR
          no → PATCH
```

---

## Version impact en cada PR

Cada PR debe declarar una de estas opciones:

- Version impact: none
- Version impact: patch
- Version impact: minor
- Version impact: major

Reglas:

- **none**: cambios internos que no justifican release ni cambio público.
- **patch**: fixes, tests, documentación relevante o estabilización sin nueva capacidad.
- **minor**: nueva capacidad compatible.
- **major**: ruptura de contrato, arquitectura o expectativa funcional.

Si `Version impact` no es `none`, actualizar:

- `package.json`
- README (título + badge + sección de estado si aplica)
- README changelog section or `CHANGELOG.md` if/when extracted
- `docs/releases/version-history.md`
- `docs/tech-debt.md` si aplica

---

## Rollback

Una versión estable debe estar asociada a un tag Git `vX.Y.Z`.

Si una nueva versión falla:

- no se edita ni se borra el histórico;
- se vuelve al tag estable anterior si hace falta;
- o se publica una nueva patch version con el arreglo.

Los anchors actuales viven en
[`docs/releases/version-history.md`](./releases/version-history.md) sección
"Release / rollback anchors".
