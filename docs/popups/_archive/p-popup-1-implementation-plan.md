# P-POPUP-1 — Implementation Plan (PRE-IMPLEMENTATION)

> Status: **PLAN ONLY**. Zero code, zero UI, zero refactor, zero camera,
> zero subset-fit, zero marker-grammar, zero lifecycle, zero React
> migration. Operational plan for the first popup pilot.
>
> Companions:
> - [`./poi-popup-canon-review.md`](./poi-popup-canon-review.md) (§7, §8)
> - [`./poi-popup-canon-proposal.md`](./poi-popup-canon-proposal.md)
> - [`./poi-popup-inventory.md`](./poi-popup-inventory.md) §2.1
> - [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md)
> - `src/design-system/tokens/source/color.json`, `popup.json`
> - `src/components/map/map-popups.ts` rama `if (isEnriched && enriched)`
>   (~L635–L900)
>
> **Governance**: este plan cae bajo matrix §2.1 (Popup canon). El PR
> que lo ejecute debe llevar Migration Impact Check (ya prerredactado
> en `poi-popup-canon-review.md §7`).

---

## 0. Alcance estricto

**Único objetivo del pilot**: sustituir literales de color, gradientes
y sombras hex hardcodeados de la **rama POI propio enriched** dentro
de `createPopupContent()` por tokens semánticos del design system v1,
**sin alterar estructura HTML, sin alterar lifecycle, sin alterar
acciones, sin alterar JS event wiring**.

Resultado esperado: el popup enriched se ve **visualmente
indistinguible** del actual (modo light) y consume tokens en lugar de
literales.

---

## 1. Estilos inline / hardcoded a reemplazar

Recogidos del inventory §2.1 + lectura de `map-popups.ts` rama
enriched. Lista exhaustiva del scope F1:

### 1.1 Colores planos hex

| Literal actual         | Uso en rama enriched                           |
|------------------------|------------------------------------------------|
| `#f9fafb`              | fondo del bloque "Índice IA + interacción"     |
| `#fef3c7` / `#fde68a`  | gradient warning del visit-validation-warning, badge IA stars |
| `#fcd34d`              | border warning                                 |
| `#92400e` / `#a16207` / `#78350f` | textos warning                      |
| `#b45309` / `#d1d5db`  | estrellas IA llenas/vacías                     |
| `#dcfce7` / `#166534` / `#86efac` | botón "Visitado" activo              |
| `#eff6ff` / `#1d4ed8` / `#93c5fd` | botón "Adoptar y Visitar"            |
| `#fff` / `#6b7280` / `#e5e7eb` | botón visited inactivo (own)            |
| `#f59e0b` / `#d1d5db`  | estrellas rating usuario                       |
| `#9ca3af`              | botón clear-rating                             |
| `#fef2f2` / `#dc2626` / `#fee2e2` | botón eliminar (rama compartida)     |
| `#ede9fe` / `#5b21b6`  | chip cultural context                          |

### 1.2 Gradientes

- `linear-gradient(135deg, #fef3c7, #fde68a)` × 2 (warning + IA stars)
- `linear-gradient(135deg, #16a34a, #22c55e)` (botón addToCollection — **excluido**: vive fuera de la rama `if (isEnriched && enriched)` y mezcla con `!isOwn`; no se toca en F1)
- `linear-gradient(...)` del `statusBarHtml` — **excluido**: vive en
  helper `buildStatusBar` y depende de `getCriteriaColor`; se evalúa
  en F1.x posterior.

### 1.3 Sombras hex

- `rgba(22, 163, 74, 0.3)` y `rgba(22, 163, 74, 0.4)` del botón
  addToCollection — **excluido** (mismo motivo).

### 1.4 Constantes locales

Dentro del archivo viven los objetos `COLOR`, `FONT`, `CARD`,
`CARD_FONT_FAMILY`, `POPUP_MAX_HEIGHT`. Algunos campos (`COLOR.foreground`,
`COLOR.muted`, `COLOR.secondary`) ya están parcialmente tokenizados a
nivel local. F1 **reapunta esos campos** a CSS vars del design system
(`var(--text-primary)`, `var(--text-secondary)`, `var(--surface-muted)`,
etc.) sin cambiar los nombres `COLOR.*` que el resto del archivo
consume.

### 1.5 Lo que NO se toca en este pilot

- **Caracteres tipográficos** `★ ☆ ▶ ✕` — quedan para F2 (icon library).
- **SVGs inline** dentro de la rama — quedan para F2.
- **Hex de la rama `!isEnriched`** (imported/empty) — quedan para F1.x.
- **Hex de `addToCollectionBtnHtml`** — vive fuera del condicional
  enriched; queda para fase followed.
- **`statusBarHtml`** — depende de helper externo `getCriteriaColor`;
  se aborda cuando se canonice el StatusSurface (F2).
- **`buildImageSection`**, `buildSourceHashtagsBlock`,
  `buildCollectionChipsPlaceholder`, `buildPersonalTagsBlock` — son
  helpers compartidos; F1 los deja intactos.
- **`createPhotoPopup`** — fuera de scope (D3 bloqueado).
- **Recovery block / NearbyPanel inline** — no se toca.
- **Admin / home / user-location / rutas** — no se tocan.
- **Lifecycle, `setPopupContent`, `openPopup`, `popupclose` handler,
  `centerOpenedPopupInVisibleMap`, `MutationObserver` de recovery** —
  no se tocan.
- **Cámara, subset-fit, marker grammar, zoom gates** — no se tocan.

---

## 2. Tokens existentes a usar

De `src/design-system/tokens/source/color.json` (CSS vars ya emitidas
por el token build):

| CSS var                       | Reemplaza a                       |
|-------------------------------|-----------------------------------|
| `--surface-muted`             | `#f9fafb` (fondo bloque IA)       |
| `--surface-card`              | `#fff` (botón visited inactivo)   |
| `--surface-border`            | `#e5e7eb`, `#d1d5db` (bordes)     |
| `--text-primary`              | `#111` / `COLOR.foreground`       |
| `--text-secondary`            | `#6b7280`, `#9ca3af` / `COLOR.muted` |
| `--state-warning`             | `#f59e0b` (estrellas rating)      |
| `--state-error`               | `#dc2626` (botón eliminar)        |
| `--state-success`             | `#16a34a` / `#166534` (visited)   |
| `--color-poi-enriched`        | `#16a34a` cuando representa estado del POI (no acción) |

De `popup.json` (sizing, ya emitidas):

| CSS var                       | Reemplaza a               |
|-------------------------------|---------------------------|
| `--popup-max-width`           | `${CARD.maxWidth}px`      |
| `--popup-max-height`          | `${POPUP_MAX_HEIGHT}`     |
| `--popup-body-padding`        | `16px 16px 8px 16px` (parcial) |
| `--popup-body-gap`            | `12px`                    |

> Nota: las CSS vars se emiten automáticamente vía
> `src/design-system/tokens/build-tokens.cjs`. F1 NO modifica el
> token build.

---

## 3. Tokens nuevos necesarios

F1 intenta no añadir tokens. Hay **dos** huecos que no encajan con
los actuales:

| Hueco                                     | Propuesta                        | Decisión |
|-------------------------------------------|----------------------------------|----------|
| Fondo "soft warning" del badge IA stars + visit-validation-warning (hoy `#fef3c7→#fde68a`) | `--state-warning-soft-bg` (HSL `45 93% 91%`) | **DIFERIR a F2** — usar `hsl(var(--state-warning) / 0.15)` como puente |
| Border "soft warning" (hoy `#fcd34d`)     | `--state-warning-soft-border`    | **DIFERIR a F2** — usar `hsl(var(--state-warning) / 0.4)` |

Decisión operativa: **F1 no introduce tokens nuevos**. Donde no haya
token exacto, se usa `hsl(var(--state-*) / α)` como puente
documentado. Tokens nuevos se proponen en F2 con su propio MIC.

---

## 4. Diff esperado por archivo

Único archivo tocado:

### `src/components/map/map-popups.ts`

- **Alcance del diff**: dentro de `createPopupContent()`, sólo el
  bloque `if (isEnriched && enriched) { return \`…\` }` (~265 líneas
  del template literal).
- **Tipo de cambio**: sustitución 1:1 de literales por
  `var(--token)` dentro de los atributos `style="…"`.
- **Líneas modificadas estimadas**: 60–90 (sólo las que contienen
  hex en la rama enriched).
- **Estructura HTML**: idéntica. Mismos tags, mismos `class`,
  mismos `data-*`, mismos `id`, mismos handlers `onmouseover/out`.
- **Constantes `COLOR.*` locales**: reapuntar `foreground` →
  `var(--text-primary)`, `muted` → `var(--text-secondary)`,
  `secondary` → `var(--surface-muted)`. Nombres se conservan.
- **Sin cambios** en: firmas de función, exports, imports,
  helpers, ramas `!isEnriched`, `addToCollectionBtnHtml`,
  `statusBarHtml`, `buildImageSection`.

**Ningún otro archivo cambia.** No se toca `LocationMap.tsx`,
`map-popup-handlers.ts`, `popup-recovery-mount.ts`,
`map-v2-renderer.ts`, `map-photo-layer.ts`, `use-popup-actions.ts`,
ni nada de `src/shared/styles/tokens/*`, ni `build-tokens.cjs`.

---

## 5. Riesgos visuales

| Riesgo                                                         | Mitigación                                                |
|----------------------------------------------------------------|-----------------------------------------------------------|
| HSL del token diverge ligeramente del hex actual               | Snapshot visual side-by-side antes de mergear             |
| `hsl(var(--state-warning) / 0.15)` se renderiza distinto del gradient `#fef3c7→#fde68a` | Aceptar pérdida del gradient en F1; documentar en QA. Si rechaza review, revertir esos 2 puntos y dejar literal hasta F2 |
| Dark mode invierte colores y el popup queda ilegible           | `LocationMap` aún no está en dark mode en producción; F1 sólo se valida en light. Snapshot dark = warning, no bloqueo |
| `var(--text-primary)` se aplica antes de que el theme provider haya hidratado y deja texto invisible un frame | Improbable (el popup se abre tras interacción de usuario, post-hydration). QA manual cubre |
| `popup-persist-on-rebuild` se rompe por cambio de DOM           | F1 NO toca DOM, sólo valores dentro de `style="…"` → riesgo nulo |
| `MutationObserver` de recovery se dispara en bucle              | F1 no toca la rama con `[data-recovery-root]` → riesgo nulo |
| `centerOpenedPopupInVisibleMap` cambia por padding distinto     | F1 no cambia padding numérico → riesgo nulo               |
| Cache de tokens vs literales en otros popups (imported, photo)  | Sólo cambia la rama enriched → otros popups intactos       |

---

## 6. QA manual esperado

Operador humano, modo light, sandbox `sandbox-agent@vandits.test`.

1. Abrir mapa global; navegar a un POI propio enriched conocido.
2. Click marker → popup abre. Verificar **idéntico aspecto** al de
   producción (hero, título, badge "Mi punto", localización, bloque
   IA, estrellas, botones Visitado/Rating, secciones colapsables,
   chips).
3. Hover sobre cada botón → mantiene transición/contraste.
4. Click "Visitado" → toggle estado visual correcto.
5. Click estrella de rating → estado correcto.
6. Click "Eliminar" → diálogo aparece; cancelar.
7. Cerrar popup (click fuera, ESC, re-click marker) → cierre limpio.
8. Re-abrir popup tras `setPopupContent` (forzar enriquecer o
   `notes-updated`) → popup persiste, estado correcto.
9. Repetir en POI con `customData.user_rating` y sin.
10. Repetir en POI con `visitRelevance` (visitado válido) y sin.
11. Comparar screenshot pre/post (F0 vs F1) → diff visual aceptable
    (≤2% píxeles).

---

## 7. Tests E2E mínimos (gating del merge)

Pre-requisito: tests verdes **antes** del cambio.
Post-requisito: mismos tests verdes **después**.

| Test                                                  | Estado actual | Acción F1            |
|-------------------------------------------------------|---------------|----------------------|
| E2E "click marker enriched → popup abre"              | existe        | debe seguir verde    |
| E2E "popup persiste tras rebuild de capa"             | existe (contract `popup-persist-on-rebuild`) | debe seguir verde |
| E2E "click fuera / ESC / re-click → popup cierra"     | existe        | debe seguir verde    |
| E2E "no flyTo/fitBounds/requestSubsetFit al abrir popup" | existe (camera-qa) | debe seguir verde |
| [NEW] Contract test: "rama enriched no contiene `#`-hex" | **CREAR** | bloqueante           |
| [NEW] Visual snapshot popup enriched (light)          | **CREAR**     | baseline + post-diff |
| Visual snapshot popup imported/empty (regresión)      | opcional      | sólo si existe baseline |

Los dos `[NEW]` se crean en el mismo PR que ejecuta F1. El contract
test se implementa sobre el HTML resultante de `createPopupContent`
con un fixture mínimo.

---

## 8. Rollback plan

F1 es trivialmente reversible.

1. **Mecanismo de protección durante rollout**: feature flag
   `popup_tokens_enriched_v1` consultado al inicio de la rama
   enriched. Si `off`, devuelve el HTML legacy (sin cambios). Si
   `on`, devuelve el HTML tokenizado. **Mismo retorno estructural**.
2. **Default**: `off` en producción durante 1 sprint; `on` en
   sandbox.
3. **Rollback inmediato (caliente)**: poner el flag en `off` →
   vuelve al HTML legacy en el siguiente render. Sin redeploy.
4. **Rollback definitivo**: `git revert` del único commit (un solo
   archivo modificado). Sin migraciones, sin estado persistido,
   sin side-effects.
5. **Métrica de decisión**: 0 regresiones en E2E, 0 reports de QA,
   ≤2% diff visual en snapshots → promote flag `on` por defecto.
   Cualquier ítem rojo → rollback.

---

## 9. Criterio de aceptación

F1 se considera completado cuando:

- [ ] La rama `if (isEnriched && enriched)` de `createPopupContent`
      no contiene literales `#xxxxxx` ni `rgba(...)` ni
      `linear-gradient(...)` con literales (excepto los explícitamente
      diferidos: `statusBarHtml`, `addToCollectionBtnHtml`,
      iconos `★ ☆ ▶ ✕`).
- [ ] Todos los E2E listados en §7 verdes en CI.
- [ ] Contract test "rama enriched sin hex" verde.
- [ ] Visual snapshot diff ≤2% píxeles en modo light.
- [ ] QA manual §6 superado por al menos un revisor humano.
- [ ] Feature flag `popup_tokens_enriched_v1` `on` en sandbox
      durante ≥1 sprint sin regresiones reportadas.
- [ ] Migration Impact Check (poi-popup-canon-review.md §7) marcado
      como ejecutado en la PR.
- [ ] `popup-persist-on-rebuild`, `MutationObserver` recovery,
      `centerOpenedPopupInVisibleMap`, lifecycle observable: **sin
      cambios verificados** (grep diff vacío fuera del bloque enriched).
- [ ] Ningún archivo distinto de `src/components/map/map-popups.ts`
      modificado.

---

## 10. Restricciones honradas

- No se ha implementado nada.
- No se ha tocado photo popup.
- No se ha tocado nearby context.
- No se ha tocado recovery, admin, home, user-location ni rutas.
- No se ha tocado lifecycle, `setPopupContent`, `openPopup`, ni
  cámara.
- No se ha tocado subset-fit.
- No se ha cambiado estructura HTML.
- No se ha migrado a React.
- Sólo se ha preparado el plan operativo del pilot.

---

## 11. Próximo paso

1. Revisar y aprobar este plan.
2. Crear flag `popup_tokens_enriched_v1` (operación trivial, fuera
   del MIC).
3. Abrir PR de F1 con: cambios en `map-popups.ts` rama enriched +
   2 tests nuevos + MIC adjunto + link a este doc.
4. Sandbox 1 sprint → promote o rollback según §9.
