# P-POPUP-3 — Ownership cleanup (plan operativo)

> Status: **APPROVED — pending implementation (P-POPUP-3A only)**.
> Scope de este doc: planificación, no código.
> Predecesores: [P-POPUP-1](./p-popup-1-validation.md), [P-POPUP-2](./p-popup-2-validation.md).
> Governance: [rollout-policy.md](../governance/rollout-policy.md) (tester-global, kill-switch global).

## 1. Problema

En el popup actual coexisten dos representaciones de la misma información de
ownership/identidad:

| Elemento | Origen | Semántica |
|---|---|---|
| Badge `"Mi punto"` / `"De {owner}"` | `src/components/map/map-popups.ts` L527–558 (`ownershipBadgeHtml`, literal `'Mi punto'` en L546) | Ownership binaria (own vs followed). No clicable. |
| Chip `#frankie_gmz` | `buildSourceHashtagsBlock` (L296–320), inyectado en L839 (rama enriched A) y L1216 (rama fallback B) vía `resolvePoiSource` | Provenance + filter action. Clicable, contrato `.source-filter-chip`. |
| `<SourceHashtag />` | `src/components/poi/SourceHashtag.tsx` | Mismo chip para fichas React. |

Para un POI **own enriched** el popup dice "es mío" dos veces (badge azul +
hashtag), y para un POI **followed** lo dice tres (forma triángulo del marker
+ `De {owner}` + `#username`).

## 2. Separación semántica canónica

- **Ownership** = "¿es mío o de otro?" → afirmación visual, no clicable.
- **Provenance / source / filter** = "¿de qué fuente viene y cómo filtro por
  ella?" → chip clicable (`SourceFilterBridge`).

El elemento de ownership y el chip de provenance NO deben repetir el mismo
dato. Si la fuente coincide con la identidad del owner (caso own/followed), la
identidad la representa **una sola** primitiva.

## 3. Canon propuesto — ownership-strip único

Una sola fila de identidad por popup, con grammar según
`resolvePoiSource(viewer, poi).type`:

```text
own:      Mío · Añadido 03/05/2026          ← sin chip clicable
followed: [▽] #frankie_gmz                  ← chip clicable, color identidad
app:      #vandits-app · #playas            ← chips clicable
source:   #osm                              ← chip clicable
```

| Caso | Identidad mostrada | Filter chip | Notas |
|---|---|---|---|
| **own** | `Mío` + fecha adopción | **No** | Filtrar por uno mismo no aporta UX; ya existe el eje `filterByUserId` en `UsersSidebar`. Literal `Mío` aprobado provisionalmente; revisable tras QA visual. |
| **followed** | `▽ #username` único, color identidad OKLCH del owner | **Sí** | Elimina `De {owner}` textual; el chip lo dice. |
| **app** | `#vandits-app` (+ `#groupId`) | **Sí** | Sin cambios visuales relevantes. |
| **source/external** | `#sourceId` | **Sí** | Sin badge "De {owner}". |
| **curator/admin** | — | — | Path no activo. Fuera de scope. |

Descartado para esta fase: mini-avatar (coste fetch + fallback, no aporta
sobre el color identidad ya cableado en el marker).

## 4. Impacto en filtros

- `SourceFilterBridge` **no se toca**. El contrato `.source-filter-chip`
  sigue válido para followed/app/source.
- En **own** desaparece el chip propio. El usuario no pierde acceso a
  "ver solo mis puntos": ese filtro vive ya en `UsersSidebar`
  (`filterByUserId`). Documentar el reemplazo explícito.
- `<SourceHashtag />` (cards React) aplica la misma regla pero **no entra**
  en 3A (fase 3C).

## 5. Migration Impact Check

| Área | Archivos | Riesgo |
|---|---|---|
| Popup HTML | `src/components/map/map-popups.ts` (L527–558 badge, L839 hashtags block en rama A) | Bajo. Edición localizada bajo flag. |
| Card React | `src/components/poi/SourceHashtag.tsx` | **No tocado en 3A**. |
| Bridge filtros | `src/components/poi/SourceFilterBridge.tsx` | **No tocado**. |
| Helpers ownership | `getLocationOwnerUserId`, `resolvePoiSource` | **No tocados** (solo consumidos). |
| Tests | `src/test/popup-tokens-enriched.test.ts`, nuevo `popup-ownership-strip.test.ts` | Añadir: own no emite chip; own emite `Mío` + fecha; literal "Mi punto" no presente bajo flag ON. |
| Docs | `docs/popups/poi-popup-canon-proposal.md`, `docs/popups/poi-popup-inventory.md`, `docs/contracts/popup-contract.md` | Actualizar §ownership-strip al cerrar 3A. |
| Governance | `docs/governance/rollout-policy.md` | Solo referencia al patrón de flag. |

**Riesgos:**
- Consumidores que dependan del literal `"Mi punto"` o del chip propio en DOM.
  Mitigación: grep global previo al corte.
- La fecha "Añadido…" pierde el contenedor badge; mover a línea propia con
  icono reloj Lucide (sin emojis, sin colores hardcoded).

**Rollback:**
- Flag canónico (patrón rollout-policy): `POPUP_OWNERSHIP_STRIP_V1_DEFAULT = true`
  + kill-switch global `window.__POPUP_OWNERSHIP_STRIP_V1__ = false`.
- Flag OFF → restaura `ownershipBadgeHtml` + entrada propia en
  `buildSourceHashtagsBlock`.

## 6. Pilot — P-POPUP-3A (mínimo)

**Scope:**
- Solo rama A enriched (`isOwn && isEnriched && enriched`) de `map-popups.ts`.
- Solo caso **own**: ocultar `ownershipBadgeHtml` y suprimir la entrada propia
  en `buildSourceHashtagsBlock`, sustituyendo por una línea única
  `Mío · Añadido dd/mm/aaaa` con icono reloj.
- Badge dev temporal `P-POPUP-3 ON` visible solo en `*.lovable.app`/
  `localhost`/`?diag=1` (mismo gate que P-POPUP-2), retirable tras ratificación.

**Out of scope explícito de 3A:**
- followed, app, source, curator.
- `<SourceHashtag />` (cards React).
- Mini-avatar.
- Cualquier cambio en `SourceFilterBridge`.
- Cámara, subset-fit, geo hierarchy, notas, estrellas/visited, lifecycle.
- F2, React migration, PopupShell, nearby, recovery.

**Fases posteriores (no se ejecutan ahora):**
- **3B** — followed: chip único `▽ #username` con color identidad; elimina
  `De {owner}` textual.
- **3C** — `<SourceHashtag />` paridad en cards.
- **3D** — app/source: revisar si `#vandits-app` necesita acortamiento.

## 7. Validación esperada tras 3A

- `data-popup-version="geo-canonical-v1"` intacto (no regresa P-POPUP-2).
- Popup own enriched:
  - **No** aparece literal `"Mi punto"`.
  - **No** aparece el chip propio (`#frankie_gmz` en own).
  - **Sí** aparece `Mío · Añadido dd/mm/aaaa`.
- Popup followed/app/source: **sin cambios** respecto al estado post P-POPUP-2.
- Vitest popup-relevantes verdes + nuevo `popup-ownership-strip.test.ts`.
- Override `window.__POPUP_OWNERSHIP_STRIP_V1__ = false` + reopen → retorna al
  badge + chip actuales (rollback verificado).
- Actualizar este doc con sección **Validation log** y enlazar desde
  `p-popup-2-validation.md` al cerrar el pilot.

## 8. Micro-review UX — ownership-strip en own enriched

Comparación de tres opciones canónicas para el caso **own enriched**, previas
a la implementación de 3A. Marco compartido: el marker del propio POI ya es un
círculo verde (ownership + estado enriched), y el viewer ya tiene `filterByUserId`
disponible en `UsersSidebar`. Es decir, "es mío" ya está dicho por la forma
del marker antes de abrir el popup.

### Opción A — `Mío · Añadido dd/mm/yyyy`

| Eje | Evaluación |
|---|---|
| Redundancia vs marker | **Alta**. El círculo verde ya afirma ownership; el literal `Mío` lo repite. |
| Ruido cognitivo | Medio. Dos tokens en la fila (`Mío` + fecha) compiten por foco. |
| Scanning visual | Penaliza: el ojo lee la palabra antes que la fecha, que es la información nueva. |
| Jerarquía vs título/tags | Aceptable si va con tipografía secundaria muted. Riesgo de leerse como sub-badge si se enfatiza. |
| Consistencia con followed/source | **Baja**. En followed la fila es chip `#username`; en own un literal en castellano. Dos gramáticas distintas. |
| Contexto temporal | Preservado. |

### Opción B — `Añadido dd/mm/yyyy` (sin ownership explícito)

| Eje | Evaluación |
|---|---|
| Redundancia vs marker | **Nula**. La ownership la lleva el marker; la fila aporta solo dato nuevo (fecha). |
| Ruido cognitivo | Bajo. Una sola unidad semántica. |
| Scanning visual | Óptimo: el ojo cae directo en la fecha. |
| Jerarquía vs título/tags | Limpia. Línea muted, secundaria, sin competir con título. |
| Consistencia con followed/source | **Alta**. Followed/source/app usan chip de provenance; own usa metadato temporal. Cada bucket tiene su gramática, pero todas son "una sola fila de identidad/contexto" — la regla canon se mantiene. |
| Contexto temporal | Preservado y realzado al ser el único contenido. |

### Opción C — Sin ownership-strip visible

| Eje | Evaluación |
|---|---|
| Redundancia vs marker | Nula. |
| Ruido cognitivo | Mínimo. |
| Scanning visual | Óptimo. |
| Jerarquía vs título/tags | Máxima limpieza. |
| Consistencia con followed/source | **Asimétrica**. Followed/app/source siguen mostrando chip; own queda completamente mudo. La asimetría es legítima (no hay nada nuevo que decir) pero **se pierde la fecha de adopción**, que sí es información que el usuario hoy ve y usa. |
| Contexto temporal | **Perdido**. Para recuperar la fecha haría falta exponerla en otro lugar (panel lateral, hover sobre marker, ficha ampliada) — fuera del scope del popup. |

### Tabla resumen

| Opción | Redundancia | Ruido | Scanning | Consistencia | Fecha visible |
|---|---|---|---|---|---|
| A `Mío · Añadido…` | Alta | Medio | Medio | Baja | Sí |
| B `Añadido…` | Nula | Bajo | Alto | Alta | Sí |
| C (nada) | Nula | Nulo | Máximo | Asimétrica | **No** |

### Recomendación canónica → **Opción B**

Razones:

1. **No duplica el marker.** El círculo verde ya transmite ownership; añadir
   `Mío` viola el mismo principio anti-redundancia que motivó P-POPUP-3
   (eliminar el duplicado badge + hashtag).
2. **Preserva el dato útil.** La fecha de adopción es información que solo
   vive aquí, y es el contenido que justifica que la fila exista.
3. **Consistencia gramatical con followed/source.** Cada bucket tiene una sola
   fila contextual bajo el geo header: followed/app/source → chip de
   provenance; own → metadato temporal. No hay duplicación cruzada y cada
   fila aporta algo que el marker no dice.
4. **Mejor scanning.** La fecha es el único token; el ojo no compite con un
   literal redundante.
5. **Reversible.** Si tras QA se decide que falta marca de ownership
   explícita, la Opción A se recupera con una línea de código bajo el mismo
   flag, sin migración de tests.

Decisión propuesta para 3A: **Opción B** como canon. Implementación con icono
reloj Lucide + tipografía muted (`text-muted-foreground text-xs`), inmediatamente
bajo el geo header canónico y antes de `buildCollectionChipsPlaceholder`.

### 8.bis Otras decisiones abiertas (revisables tras QA visual)

- Si tras QA la fila se siente "huérfana" sin etiqueta de ownership, fallback
  a Opción A con literal `Tuyo` (registro más natural en castellano que `Mío`).
- Confirmar tipografía y peso del icono reloj para no competir con el geo
  header (que ya usa chips con fondo).
