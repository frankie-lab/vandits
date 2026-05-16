# Rollout Policy — Fase Tester-Global

> Status: **ACTIVE — FOUNDATION** (Fase tester-global de Vandits).
> Companion to:
> - [`./documentation-governance-policy.md`](./documentation-governance-policy.md)
> - [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md)
> - [`../popups/p-popup-1-validation.md`](../popups/p-popup-1-validation.md)
> - [`../popups/p-popup-2-validation.md`](../popups/p-popup-2-validation.md)

---

## 1. Contexto

En esta fase de Vandits **todos los usuarios son effectively testers**.
No existe un anillo "beta cerrada" separado de "producción estable".
Por tanto, cualquier gating de UX/canon/popup por identidad introduce
fragmentación de cohorte sin ningún beneficio operativo y rompe la
trazabilidad del rollout.

## 2. Regla operativa

> **Canon validado → default ON global. Sin excepciones por usuario.**

Concretamente, está **PROHIBIDO**:

- Gating de canon/UX por `auth.uid()`, email, dominio de email,
  `app_metadata.role`, claim JWT, cohort, A/B bucket o
  feature-flag-per-user.
- Activar un canon "sólo para sandbox" o "sólo para @vandits.test".
- Crear un producto paralelo sandbox con UX divergente.
- Diferir un canon validado bajo argumento "todavía no todos los
  usuarios están listos" — si está validado, va global.

Y está **PERMITIDO**:

- Default global `const X_DEFAULT = true;` en el módulo canónico.
- Kill-switch global runtime vía `window.__X__ = false` aplicable a
  cualquier sesión sin redeploy. Es herramienta de rollback/debug, no
  segmentación.
- Badges/diagnostics gated por **entorno** (hostname `*.lovable.app`,
  `localhost`) o **query-string** (`?diag=1`). No segmentan usuarios.
- Code revert de 1 línea (`X_DEFAULT = true → false`) como rollback
  duro si el kill-switch global no basta.

## 3. Patrón canónico de flag

```ts
// Default global. Sin condicional por usuario.
const X_CANONICAL_V1_DEFAULT = true;

function isXCanonicalV1On(): boolean {
  if (typeof window !== 'undefined') {
    const w = window as any;
    // Kill-switch GLOBAL. No leer identidad de usuario aquí.
    if (typeof w.__X_CANONICAL_V1__ === 'boolean') {
      return w.__X_CANONICAL_V1__;
    }
  }
  return X_CANONICAL_V1_DEFAULT;
}
```

Cero ramas por `uid`. Cero lecturas de `profiles`. Cero `useAuth()`
dentro del flag.

## 4. Uso permitido del sandbox

El sandbox mirror (`sandbox-agent@vandits.test`,
uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb`, ver
`mem://preferences/sandbox-user-mirror`) existe **únicamente** para:

- Fixtures de E2E (`e2e/`, `scripts/e2e/ensure-test-fixture.ts`).
- Datos sintéticos reproducibles en preview.
- Validación técnica de pipelines (geocoding, enrichment, source).
- Pruebas controladas que requieren cuenta real con sesión.

**NO** es vehículo de:

- Activación temprana de UX.
- Cohort de validación visual.
- Segmentación de canon "sólo sandbox primero, resto después".

La validación visual humana se hace ya con default ON global en
preview/app, como se ratificó para P-POPUP-2 (ver
`p-popup-2-validation.md` §5).

## 5. Verificación al cierre de cada pilot

Antes de marcar un pilot como `ratified-default-on`, comprobar
explícitamente que:

1. El flag tiene `_DEFAULT = true` literal, no `=== sandboxUid`.
2. La función `isXOn()` no consulta `auth`, `profiles`, ni email.
3. El kill-switch runtime es `window.__X__` (global), no
   `localStorage[userId].__X__` (per-user).
4. Cualquier badge/diagnostic está gated por hostname/query-string, no
   por uid.
5. Los grep `rg "sandbox|vandits.test|uid ===|email ===" <módulo>` no
   devuelven gating de canon.

Esta verificación se documenta en el validation log del pilot.

## 6. Estado actual de los pilots ratificados

| Pilot | Flag | Default | Gating por usuario | Kill-switch |
|---|---|---|---|---|
| P-POPUP-1 | `POPUP_TOKENS_ENRICHED_V1_DEFAULT` | `true` (global) | Ninguno | `window.__POPUP_TOKENS_ENRICHED_V1__` (global) |
| P-POPUP-2 | `POPUP_GEO_CANONICAL_V1_DEFAULT` | `true` (global) | Ninguno | `window.__POPUP_GEO_CANONICAL_V1__` (global) |

Verificado por audit del 2026-05-16 sobre `src/components/map/map-popups.ts`,
`src/components/LocationMap.tsx`, `src/shared/popup/*.ts`.

## 7. Excepciones

Esta política aplica a **UX, canon, popup, mapa, marker grammar,
visibility, lifecycle**. Quedan fuera (y pueden tener gating legítimo
por permiso/rol):

- **Permisos administrativos** (paneles `/admin/*`, herramientas de
  mantenimiento geo, sources panel): pueden requerir `has_role(user_id,
  'admin')` — eso no es UX gating, es control de acceso.
- **RLS de datos**: lo que ve cada usuario sobre sus propios POIs vs
  POIs ajenos es dominio de privacy, no de canon. Ver
  `mem://logic/sharing/curated-only-rule`.
- **Identidad cromática de owner**: el color OKLCH per-viewer del
  followed-POI no es gating de UX, es presentación canónica
  parametrizada por el viewer.

## 8. Caducidad

Esta política está vigente mientras Vandits opere en fase
tester-global. Cuando se introduzca un anillo "estable" diferenciado
de "beta", se revisará y, si procede, se permitirá staged rollout
documentado vía ADR específico. Hasta ese ADR, **no hay staged
rollout por usuario**.

## 9. Persistencia

- `docs/governance/rollout-policy.md` (este archivo).
- Memoria: `mem://governance/rollout-policy` + entrada Core en
  `mem://index.md`.
- Triggers de update: cuando se ratifique un nuevo pilot
  (añadir fila a §6) o cuando se introduzca el anillo estable.
