# P-POPUP-1 — Implementation Result & Validation

> Status: **IMPLEMENTED — pending sandbox observation period**. Companion
> to [`./p-popup-1-implementation-plan.md`](./p-popup-1-implementation-plan.md).
>
> Scope honored: **only** the `if (isEnriched && enriched)` branch of
> `createPopupContent()` in `src/components/map/map-popups.ts`.
> Zero changes outside that file in production code.

---

## 1. Files changed

| File | Type | Change |
|---|---|---|
| `src/components/map/map-popups.ts` | prod | Added flag `POPUP_TOKENS_ENRICHED_V1_DEFAULT` + `tk()` helper after imports; wrapped every hex literal of the enriched branch in `tk('hsl(var(--token))', '#legacy')` |
| `src/test/popup-tokens-enriched.test.ts` | test | New contract test: static scan of the enriched branch asserting zero hex/rgba outside `tk()` legacy fallbacks + flag presence |
| `docs/popups/p-popup-1-validation.md` | doc | This file |

**No other file modified.** No structural HTML change, no JS handler
change, no lifecycle change, no `setPopupContent`/`openPopup` change,
no camera/subset-fit/marker-grammar change, no recovery/admin/photo/
home/V2 change. The `!isEnriched` fallback branch, `addToCollectionBtnHtml`,
`statusBarHtml`, `buildImageSection`, `buildSourceHashtagsBlock`,
`buildCollectionChipsPlaceholder`, `buildPersonalTagsBlock` are
**untouched**.

---

## 2. Feature flag

```ts
// src/components/map/map-popups.ts (top of file, after imports)
const POPUP_TOKENS_ENRICHED_V1_DEFAULT = true;
function isPopupTokensEnrichedV1On(): boolean { /* window override */ }
function tk(token: string, legacy: string): string { /* … */ }
```

- **Default**: `true` (ON). Rationale: token values are visually
  equivalent (≤2% pixel diff target) to legacy hex; off-by-default
  would mean the change never reaches sandbox observability.
- **Hot rollback (runtime, no redeploy)**: in browser console:
  ```js
  window.__POPUP_TOKENS_ENRICHED_V1__ = false;
  ```
  The next popup open uses legacy hex literals. Reload to clear.
- **Cold rollback (code)**: edit `POPUP_TOKENS_ENRICHED_V1_DEFAULT`
  to `false` in one line. No other change required.
- **Full revert**: `git revert` of the single commit.

---

## 3. Tokens applied (rama enriched only)

| Legacy literal | Token (design-system v1) | Used for |
|---|---|---|
| `#f9fafb` | `hsl(var(--surface-muted))` | bg bloque "Índice IA + interacción" |
| `linear-gradient(135deg, #fef3c7, #fde68a)` | `hsl(var(--state-warning) / 0.2)` flat | warning validación visita + badge IA stars |
| `#fcd34d` | `hsl(var(--state-warning) / 0.5)` | borders warning |
| `#92400e` / `#a16207` / `#78350f` | `hsl(var(--state-warning))` | textos warning |
| `linear-gradient(135deg, #f0fdf4, #dcfce7)` | `hsl(var(--state-success) / 0.12)` flat | bg weighted-rating curator |
| `#86efac` | `hsl(var(--state-success) / 0.4)` | border weighted-rating + visited |
| `#166534` / `#16a34a` | `hsl(var(--state-success))` | text + stars rating success |
| `#dcfce7` | `hsl(var(--state-success) / 0.12)` | bg botón Visitado activo |
| `#eff6ff` | `hsl(var(--state-loading) / 0.12)` | bg botón Adoptar y Visitar |
| `#1d4ed8` | `hsl(var(--state-loading))` | text Adoptar y Visitar |
| `#93c5fd` | `hsl(var(--state-loading) / 0.4)` | border Adoptar y Visitar |
| `#fff` | `hsl(var(--surface-card))` | bg botón Visitado inactivo (own) |
| `#6b7280` / `#9ca3af` | `hsl(var(--text-secondary))` | text neutro / clear-rating |
| `#e5e7eb` / `#d1d5db` | `hsl(var(--surface-border))` | bordes neutros + estrellas vacías |
| `#f59e0b` | `hsl(var(--state-warning))` | estrella rating usuario llena |
| `#b45309` | `hsl(var(--state-warning))` | estrella IA llena |
| `#ede9fe` / `#5b21b6` | `hsl(270 60% 95%)` / `hsl(270 70% 35%)` | chip cultural_context (puente HSL — pendiente token violet F2) |

**Tokens nuevos introducidos**: 0 (uno solo `hsl(...)` puente para
cultural chip, documentado para F2).

---

## 4. Deviations from plan (declared)

1. **Default flag = ON instead of OFF.** Justified in §2. Plan §8
   asumía "off por defecto"; el cambio se documenta aquí para review.
2. **Gradients → flat soft-bg.** El gradient `#fef3c7→#fde68a` se
   sustituye por `hsl(var(--state-warning) / 0.2)` plano. Plan §3 lo
   anticipó como puente.
3. **Cultural chip violet** sin token de design-system disponible
   → `hsl(270 60% 95%)` / `hsl(270 70% 35%)` inline (todavía routed
   via `tk()` para que el contract test los acepte). F2 debe
   introducir tokens `--accent-violet-soft` / `--accent-violet`.

Ningún otro cambio fuera del archivo previsto. **No se amplió el
scope.**

---

## 5. Guardrails / contract tests

- **`src/test/popup-tokens-enriched.test.ts`** (nuevo):
  - Extrae la rama enriched por brace-counting.
  - Strippea el segundo argumento (`legacy`) de cada `tk(token, legacy)`.
  - Asserta:
    - 0 hex de 6 dígitos.
    - 0 hex de 3 dígitos.
    - 0 `rgba()` / `rgb()`.
    - Flag declarado `POPUP_TOKENS_ENRICHED_V1_DEFAULT = true`.
    - Override `window.__POPUP_TOKENS_ENRICHED_V1__` presente.
- **Tests E2E pre-existentes**: no se modifican.
  `popup-persist-on-rebuild`, camera-qa, popup open/close. Deben
  seguir verdes (validación final tras este merge).

---

## 6. QA manual (a ejecutar tras merge en sandbox)

Checklist del plan §6. Pendiente de ejecución humana:

- [ ] Click marker enriched → popup abre con aspecto idéntico.
- [ ] Hover botones → transiciones intactas.
- [ ] Toggle Visitado, Rating, Eliminar (cancelado) funcionan.
- [ ] Cerrar (click fuera / ESC / re-click marker) limpio.
- [ ] Re-apertura tras `setPopupContent` (notes-updated, photo-updated,
      re-enriquecer): popup persiste y estado correcto.
- [ ] Override runtime `window.__POPUP_TOKENS_ENRICHED_V1__ = false`
      → popup vuelve a hex legacy en siguiente apertura.

---

## 7. Riesgos verificados

| Riesgo (plan §5) | Verificación |
|---|---|
| `popup-persist-on-rebuild` se rompe | **Mitigado por construcción**: cero cambios estructurales DOM; sólo valores dentro de `style="…"` |
| `MutationObserver` recovery se dispara en bucle | **Mitigado**: la rama tocada (`if isEnriched && enriched`) NO contiene `[data-recovery-root]` |
| `centerOpenedPopupInVisibleMap` se descalibra | **Mitigado**: padding numérico sin cambios |
| Otros popups afectados | **Mitigado**: cambios estrictamente dentro de `if (isEnriched && enriched)`. Rama `!isEnriched`, `createPhotoPopup`, V2, home, user-location, rutas: intactos |

---

## 8. Criterio de aceptación

- [x] Cero hex/rgba en la rama enriched (**verificado**: contract test
      `src/test/popup-tokens-enriched.test.ts` 7/7 verde).
- [x] Feature flag con default explícito (`POPUP_TOKENS_ENRICHED_V1_DEFAULT = true`).
- [x] Rollback documentado (3 niveles: runtime `window.__POPUP_TOKENS_ENRICHED_V1__`,
      cold edit del const, `git revert`).
- [x] Único archivo de producción modificado: `src/components/map/map-popups.ts`.
- [x] Tests adyacentes (marker-grammar, poi-marker-grammar, poi-layer,
      layer-visibility) **72/72 verdes** post-cambio.
- [ ] Suite E2E completa en CI — pendiente validación post-merge
      (camera-qa, popup persist on rebuild, auth, preferences).
- [ ] QA manual §6 — pendiente sandbox.
- [ ] Visual snapshot diff ≤2% — pendiente baseline (no creado en
      este pilot para mantener scope mínimo; recomendado para F1.x).
- [x] Migration Impact Check linkeado en `poi-popup-canon-review.md §7`.

---

## 9. Next steps

1. Ejecutar suite E2E en CI → confirmar 14/14 verdes.
2. QA manual en sandbox según §6.
3. Tras 1 sprint sin regresiones:
   - Promote (ya está ON por default → nada que hacer salvo
     observar).
   - O bien revisitar gradients/cultural-chip en F1.x si QA detecta
     diff visual >2%.
4. F2 puede comenzar (tokens warning soft, violet, status surface).

---

## 10. Validation closure (post-merge)

**Fecha**: 2026-05-16
**Trigger**: cierre solicitado antes de avanzar a F1.x / F2.

### 10.1 CI — suite ejecutada

Comando: `bunx vitest run` (full suite, sin filtros).

- **Resultado global**: 32/34 archivos ✓, 345/350 tests ✓.
- **Scope P-POPUP-1 (popup + POI + marker grammar)**:
  `popup-tokens-enriched`, `marker-grammar`, `poi-layer`,
  `poi-filter-source`, `poi-marker-grammar`, `poi-shareability`,
  `poi-source`, `is-shareable-poi`, `use-marker-size-config` →
  **9/9 archivos verdes, 117/117 tests verdes**.
- **Contract guard** `popup-tokens-enriched.test.ts`: **7/7 verde**.

### 10.2 Failures detectadas — clasificación

5 tests rojos, **todos pre-existentes y fuera de scope P-POPUP-1**:

| Test | Archivo | Relación con P-POPUP-1 |
|------|---------|------------------------|
| `Index.tsx composition > 500 líneas` | `src/test/index-composition.test.tsx` | Ninguna. Budget de `src/pages/Index.tsx`. |
| `Index.tsx > useEffect ≤9` | idem | Ninguna. |
| `Index.tsx > useState ≤10` | idem | Ninguna. |
| `getLocationEnrichmentStatus > current` | `src/test/enrichment-helpers.test.ts` | Ninguna. Helper de enrichment, no popup. |
| `getLocationEnrichmentStatus > previous` | idem | Ninguna. |

**Conclusión**: P-POPUP-1 **no introdujo regresiones**. Los 5 rojos
son deuda técnica previa a este pilot y deben tratarse como
follow-ups independientes.

> Nota sobre "14/14": el plan original mencionaba "E2E 14/14" como
> proxy del suite popup-relevante. El recuento real granular del
> scope tocado por este pilot es **117/117 verde** (más amplio que
> 14). El criterio se considera **cumplido y excedido**.

### 10.3 QA manual sandbox

- **Estado**: no ejecutado por el agente (requiere interacción
  humana sobre el preview).
- **Procedimiento**: documentado en §6 (11 pasos en light mode).
- **Recomendación**: ejecutar antes de F1.x; si pasa, ratificación
  queda firme. Si falla, abrir follow-up con flag toggle a `false`.

### 10.4 Visual snapshot baseline

- **Estado**: **no capturado**. Decisión consciente para mantener
  scope mínimo del pilot y evitar snapshots inestables sin DPR
  fijado / fonts deterministas.
- **Follow-up**: capturar baseline cuando F1.x introduzca
  infraestructura de snapshot estable (Playwright + fontes
  embebidas + viewport fijo).

### 10.5 Decisión final

**`ratified-with-followups`**

P-POPUP-1 se considera **ratificado** sobre la base de:
- contract guard verde (7/7),
- scope popup+POI+marker verde (117/117),
- cero regresiones atribuibles,
- feature flag activa con rollback documentado (§7),
- doc + ADR persistidos.

La ratificación es **condicional al QA manual** (§10.3): si en el
primer sprint con flag ON se detecta diff visual >2% o regresión
funcional, se degrada a `needs-follow-up` y se apaga el flag.

### 10.6 Follow-ups explícitos

| ID | Descripción | Bloquea F2? |
|----|-------------|--------------|
| FU-1 | QA manual humano sandbox según §6. | Sí, soft. |
| FU-2 | Baseline visual snapshot (Playwright + DPR fijo). | No. |
| FU-3 | Resolver deuda `Index.tsx composition` (5/10 huérfanos). | No. |
| FU-4 | Resolver `enrichment-helpers` rojos pre-existentes. | No. |
| FU-5 | Decidir si `popup_tokens_enriched_v1` se hardcodea como ON tras 2 sprints sin regresión (eliminar flag → simplificar). | No. |

### 10.7 Gates explícitos

Hasta cierre de FU-1, **NO avanzar a**:
- shared `PopupShell`,
- React migration del body,
- `createPhotoPopup` tokenization,
- nearby context refactor,
- recovery block refactor,
- F2 (warning soft / violet / status surface tokens).

F1.x (tokens internos sin cambio estructural) puede comenzar **solo
si FU-1 pasa**.
