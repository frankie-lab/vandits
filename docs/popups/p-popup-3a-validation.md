# P-POPUP-3A — Validation (ownership-strip, own enriched)

> Status: **IMPLEMENTED — pending preview ratification**.
> Plan: [`./p-popup-3-ownership-cleanup-plan.md`](./p-popup-3-ownership-cleanup-plan.md).
> Governance: [`../governance/rollout-policy.md`](../governance/rollout-policy.md)
> (tester-global, default ON, kill-switch global).
> Predecesores: [P-POPUP-1](./p-popup-1-validation.md), [P-POPUP-2](./p-popup-2-validation.md).

## 1. Scope ejecutado

Cambios aplicados **únicamente** a la rama A enriched
(`if (isEnriched && enriched)`) de `createPopupContent()` en
`src/components/map/map-popups.ts`, condicionados a `isOwn === true`:

- **Eliminado** badge `ownershipBadgeHtml` con literal `"Mi punto"` en el
  header (sigue activo para followed en la misma rama).
- **Eliminado** chip `#<username>` propio (`source.type === 'own'`) emitido
  por `buildSourceHashtagsBlock` (followed/app/source siguen emitiéndolo
  intacto).
- **Añadido** `buildOwnAddedLineHtml(location)`: línea compacta
  `Añadido dd/mm/yyyy` con icono reloj SVG y color
  `hsl(var(--muted-foreground))`, en la misma posición que ocupaba el bloque
  de hashtags (justo bajo el geo header canónico, antes de
  `buildCollectionChipsPlaceholder`).
- **Añadido** atributo `data-popup-ownership-strip="v1" | "legacy"` en el
  root del popup para test/diagnóstico.
- **Añadido** badge dev `P-POPUP-3 ON` (token `--accent`) visible solo en
  `*.lovable.app`/`localhost`/`?diag=1` y solo cuando `isOwn` + flag ON.
  Retirable tras ratificación, como el de P-POPUP-2.

## 2. Fuera de scope (no tocado)

- followed / app / source / curator en ninguna rama.
- Rama B (fallback no-enriched) — sigue emitiendo `ownershipBadgeHtml` y
  `buildSourceHashtagsBlock` sin gating (out of scope; revisar en 3B+).
- `<SourceHashtag />` (cards React) — fase 3C.
- `SourceFilterBridge` y contrato `.source-filter-chip` — intactos.
- Geo header canónico (P-POPUP-2), tags, notas, estrellas/visited.
- Cámara, subset-fit, lifecycle, marker grammar, visibility, zoom gates.
- F2, React migration, PopupShell, nearby, recovery.

## 3. Flag y rollback

```ts
// src/components/map/map-popups.ts
const POPUP_OWNERSHIP_STRIP_V1_DEFAULT = true;
export function isPopupOwnershipStripV1On(): boolean { /* … */ }
```

- **Default ON global**, conforme `rollout-policy.md`. Sin gating por
  user/email/role/cohort.
- **Kill-switch global runtime** (rollback/debug, sin segmentación):

  ```js
  window.__POPUP_OWNERSHIP_STRIP_V1__ = false;
  // Reopen popup → vuelve a "Mi punto" + chip #username + sub-fecha legacy.
  ```

- **Rollback código**: cambiar `POPUP_OWNERSHIP_STRIP_V1_DEFAULT` a `false`
  (1 línea). Las ramas fallback (`ownershipBadgeHtml` y
  `buildSourceHashtagsBlock` sin `suppressOwn`) permanecen intactas y son el
  rollback path.

## 4. Tests

Nuevo: `src/test/popup-ownership-strip.test.ts`. Cubre:

- `buildSourceHashtagsBlock(..., { suppressOwn: true })` devuelve `''` solo
  cuando `type === 'own'`; followed/app/source siguen emitiendo
  `.source-filter-chip`.
- `buildOwnAddedLineHtml`:
  - Emite `Añadido dd/mm/yyyy` + `data-popup-own-added`.
  - **No** contiene literales `"Mi punto"`, `"Mío"`, `"Tuyo"` (consistente
    con la decisión Opción B del plan §8).
  - `createdAt` null/invalid → cadena vacía.
  - Color vía `hsl(var(--muted-foreground))`, sin hex hardcoded.
- Flag: default `true`; kill-switch
  `window.__POPUP_OWNERSHIP_STRIP_V1__ = false` respetado.
- Static guards sobre `map-popups.ts`: rama A envuelve `ownershipBadgeHtml`
  bajo el flag y sustituye `buildSourceHashtagsBlock` por
  `buildOwnAddedLineHtml` en own.

## 5. Checklist de validación en preview (manual)

- [ ] Hard refresh preview.
- [ ] Abrir un POI **own enriched** → DevTools del root popup contiene
      `data-popup-version="geo-canonical-v1"` **y**
      `data-popup-ownership-strip="v1"`.
- [ ] El popup own enriched **NO** muestra `"Mi punto"`.
- [ ] El popup own enriched **NO** muestra el chip propio
      `#<username>`.
- [ ] El popup own enriched **SÍ** muestra una sola línea
      `Añadido dd/mm/yyyy` con icono reloj, bajo el geo header canónico.
- [ ] Badge dev `P-POPUP-3 ON` visible en preview/localhost solo en own
      enriched.
- [ ] Abrir un POI **followed enriched** → header sigue mostrando
      `De {owner}` y el chip `#<username>` clicable sigue presente
      (sin cambios respecto al estado post P-POPUP-2).
- [ ] Click sobre cualquier chip clicable (followed/app/source) sigue
      disparando filtro vía `SourceFilterBridge` (sin regresión del
      contrato `.source-filter-chip`).
- [ ] Geo header canónico, tags, notas, estrellas/visited, colecciones:
      sin cambios visibles.
- [ ] Kill-switch global: en consola `window.__POPUP_OWNERSHIP_STRIP_V1__ = false`,
      cerrar y reabrir el mismo POI own → vuelve `"Mi punto"` + chip
      propio + sub-fecha legacy. Limpiar override y recargar → vuelve al
      canon 3A.

## 6. Validation log

- _Pendiente_: ejecutar vitest popup-relevantes + checklist §5 en preview.

## 7. Decisiones abiertas

- Tras QA visual, evaluar si la línea `Añadido…` se siente "huérfana" sin
  marca de ownership. Fallback aprobado en plan §8.bis: añadir literal
  `Tuyo` (no `Mío`). Reversible con un solo edit en
  `buildOwnAddedLineHtml`.
- Retirar badge dev `P-POPUP-3 ON` cuando el rollout esté ratificado en
  producción (mismo patrón que el badge de P-POPUP-2).

## 8. Próximas fases (no ejecutadas)

- **3B**: followed — chip único `▽ #username` con color identidad; elimina
  `De {owner}` textual.
- **3C**: paridad en `<SourceHashtag />` (cards React).
- **3D**: revisión de app/source para acortar `#vandits-app` si procede.
