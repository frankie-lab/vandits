# POI Popup — Canon Proposal

> Status: **PROPOSAL / PRE-IMPLEMENTATION**. Zero code, zero file moves,
> zero UI changes, zero refactor. This document defines the target canon
> for POI popups before any migration starts.
>
> Companion to:
> - [`./poi-popup-inventory.md`](./poi-popup-inventory.md) — current state
> - [`../interaction-primitives.md`](../interaction-primitives.md) — primitives
> - [`../contracts/popup-contract.md`](../contracts/popup-contract.md) — popup contract
> - [`../contracts/canon-change-policy.md`](../contracts/canon-change-policy.md) — change policy
>
> **Canon Change Policy applies**: ratifying this proposal triggers a
> Migration Impact Check (see §5) before any phase ships.

---

## 0. Scope

This document proposes a unified canon for **POI popups** rendered on
the global map and document/collection views. It does **not** propose
implementation, does **not** authorize refactors, and does **not** alter
camera, subset-fit, marker grammar, or QA contracts.

---

## 1. Canon propuesto

### 1.1 Qué es un POI popup en Vandits

Un POI popup es una **superficie contextual efímera** anclada a un
marker geográfico, que muestra la identidad de un punto, su estado de
enriquecimiento/salud y un conjunto acotado de acciones del owner o del
viewer.

Es:

- Una **ContextualSurface** anclada a un marker.
- Una **DismissibleSurface** que puede cerrarse por click fuera, ESC,
  re-click del marker o navegación.
- Un **FocusEmitter** débil: puede emitir eventos de focus
  (`lovable:popup-opened`, `lovable:popup-closed`) pero **no** mueve la
  cámara por sí mismo (subset-fit es responsabilidad del kernel).
- Un **StatusSurface** lector de estado canónico
  (`getPointVisualState`, `getPointHealthRings`, `isPointEnriched`).

### 1.2 Qué NO debe ser

- **No** es un panel lateral ni un Sheet.
- **No** es un editor inline (el editor de notas/tags abre un panel
  propio; el popup sólo lanza la acción).
- **No** es una fuente de verdad: nunca muta estado del marker, sólo
  observa.
- **No** decide visibilidad, capa o forma del marker
  (responsabilidad de `applyLayerVisibility` + `createCustomIcon`).
- **No** dispara `flyTo`, `fitBounds`, ni `requestSubsetFit`.
- **No** hardcodea colores ni iconos: lee tokens + `icon-utils.tsx`.
- **No** ejecuta lógica de dominio (permisos, relevancia, dedup):
  recibe props derivadas.

### 1.3 Ownership

Tres clases de ownership canónicas:

| Clase        | Origen                                  | Acciones por defecto                      |
|--------------|-----------------------------------------|-------------------------------------------|
| `own`        | `getLocationOwnerUserId(loc) === me`    | Editar, enriquecer, recovery, borrar, notas |
| `followed`   | owner ∈ `followed accepted`             | Ver, abrir ficha, copiar a mi catálogo    |
| `app/source` | `resolvePoiSource === app \| source`    | Sólo lectura + "añadir a mi catálogo"     |

Ownership se resuelve **antes** de construir el popup; el renderer sólo
recibe `ownershipClass`.

### 1.4 Lifecycle

```
marker click
   └─> openPopup(loc)
         ├─ resolveOwnership(loc)
         ├─ resolveVisualState(loc)        // enriched | imported | empty
         ├─ resolveHealthRings(loc)        // partial | chain | review | hardError
         ├─ buildPopupModel(loc, ctx)      // pure
         └─ mountPopupSurface(model)
                ├─ ContextualSurface (anchor=marker)
                ├─ StatusSurface (header)
                ├─ body (variant-specific)
                └─ ObservableAction[] (actions)
   └─> on dismiss
         └─ emit lovable:popup-closed { locId, reason }
```

Reglas:

- **popup-persist-on-rebuild**: si la capa se reconstruye, el popup
  abierto se re-monta sobre el nuevo marker del mismo `locId`.
- **No silent close**: todo cierre emite evento con `reason`
  (`user`, `replaced`, `route-change`, `marker-removed`).
- **Single popup**: máximo uno abierto por mapa.

### 1.5 Estructura visual canónica

```
┌─ ContextualSurface ─────────────────────────────┐
│ [header]  status-chip + ownership-badge         │  ← StatusSurface
│           title (place name)                    │
│           subtitle (geo: comarca · provincia)   │
├─────────────────────────────────────────────────┤
│ [hero]    optional photo / collection tint      │  ← opcional
├─────────────────────────────────────────────────┤
│ [body]    variant-specific React tree           │
│           - enriched: descripción + meta        │
│           - imported: catalog match + recovery  │
│           - empty:    UnenrichedRecoveryBlock   │
│           - followed: owner identity + ficha    │
├─────────────────────────────────────────────────┤
│ [actions] ObservableAction[]                    │  ← máx 4 visibles + overflow
└─────────────────────────────────────────────────┘
```

### 1.6 Secciones obligatorias

- `header.status-chip` (estado canónico)
- `header.title`
- `header.ownership-badge` (own/followed/app/source)
- `actions` (mínimo 1: "abrir ficha" o "ver detalle")

### 1.7 Secciones opcionales

- `hero` (foto, collection tint, mapa mini)
- `body.meta` (registro, fuente, último update)
- `body.recovery` (sólo si `visualState === empty` o health ring activo)
- `body.nearby-context` (inline, sólo si `empty` o `unresolved geo`)
- `body.notes-preview` (si hay notas del viewer)

### 1.8 Acciones permitidas

Todas las acciones son `ObservableAction` con `opId` único, traza y
estados {idle, pending, done, error}. Inventario canónico:

| Acción            | Ownership   | Notas                                |
|-------------------|-------------|--------------------------------------|
| `open-detail`     | all         | Abre ficha completa (panel)          |
| `enrich`          | own         | Dispara enrichment trigger unified   |
| `recover`         | own         | Abre recovery block / search         |
| `edit-notes`      | own         | Abre panel notas                     |
| `add-to-catalog`  | followed/app| Copia con dedup 250m                 |
| `copy-coords`     | all         | Clipboard                            |
| `delete`          | own         | Confirmación obligatoria             |
| `report`          | all         | Sólo si feature flag                 |

### 1.9 Estados permitidos

- `idle` (default)
- `loading` (skeleton header + body)
- `pending-action` (acción en vuelo, badge en el botón)
- `error` (banner inline, dismissible)
- `empty-recovery` (cuerpo = recovery block)
- `read-only` (followed/app/source sin acciones de mutación)

### 1.10 Estados prohibidos

- **Doble popup** abierto a la vez.
- **Popup sin `locId`** (anonymous content).
- **Popup que muta marker color/shape** (rompe `createCustomIcon`).
- **Popup que llama a `flyTo`/`fitBounds`** directamente.
- **Popup con HTML string + React mount mezclados** (estado actual,
  deuda explícita).
- **Popup con hex colors hardcoded** o SVG inline fuera de `icon-utils`.
- **Popup con lógica de permisos** (debe venir resuelta).

---

## 2. Modelo de variantes

Una sola `PopupShell` + un `body` polimórfico. Lo único que **cambia
por estructura** es el `body`; el resto (`header`, `actions`,
`lifecycle`) es idéntico.

| Variante           | Cambia por… | Body                                      |
|--------------------|-------------|-------------------------------------------|
| `own/enriched`     | contenido   | `<EnrichedBody>` (descripción + meta)     |
| `own/imported`     | contenido   | `<ImportedBody>` (catálogo común + CTA enrich) |
| `own/empty`        | estructura  | `<RecoveryBody>` (UnenrichedRecoveryBlock + NearbyPanel inline) |
| `followed`         | contenido   | `<FollowedBody>` (owner identity + ficha) |
| `photo`            | estructura  | `<PhotoBody>` (foto OneDrive + meta EXIF) |
| `recovery`         | =empty      | alias de `own/empty` (no es variante propia) |
| `nearby-context`   | contenido   | **NO es popup propio**: vive inline dentro de `own/empty` (canon vigente) |
| `admin/workspace`  | contenido   | `<AdminBody>` (decisión: ver §3)          |

**Reducción**: de 12+ variantes actuales → **5 bodies canónicos**
(`Enriched`, `Imported`, `Recovery`, `Followed`, `Photo`), más
`Admin` pendiente de decisión.

---

## 3. Mapping a primitives

| Pieza canónica       | Primitive                | Notas                                  |
|----------------------|--------------------------|----------------------------------------|
| Popup shell          | `ContextualSurface`      | anchor=marker, dismissible             |
|                      | `OverlaySurface`         | z-index canónico, click-outside        |
|                      | `DismissibleSurface`     | ESC, re-click, route-change            |
| Header               | `StatusSurface`          | lee `getPointVisualState` + ownership  |
| Open/close events    | `FocusEmitter`           | emite `lovable:popup-*` con `opId`     |
| Actions (botones)    | `ObservableAction`       | opId, traza, estados                   |
| Enrich / delete      | `BlockingOperation`      | requiere confirmación + lock UI        |
| Recovery / nearby    | `ContextualSurface`      | inline dentro del body                 |

---

## 4. Decisiones pendientes

| # | Decisión                                            | Recomendación                | Estado    |
|---|------------------------------------------------------|------------------------------|-----------|
| D1 | `isCuratorPoint` vivo o muerto                       | **MUERTO** — purgar          | bloqueada hasta confirmar |
| D2 | `map-v2-renderer` ¿convive o sustituye `map-popups`? | **SUSTITUYE** tras fase 5    | abierta   |
| D3 | Photo popup ¿unificado o separado?                   | **Unificado** como `<PhotoBody>` dentro de la shell común | abierta |
| D4 | Nearby context ¿inline o fuera?                      | **INLINE** (canon vigente)   | resuelta  |
| D5 | Recovery block ¿inline o fuera?                      | **INLINE** dentro del body   | resuelta  |
| D6 | Admin/workspace ¿variante propia o feature flag sobre `own`? | **Flag sobre `own`** | abierta   |
| D7 | Home/user-location popups ¿bajo este canon?          | **NO** — superficie distinta | resuelta  |

---

## 5. Migration Impact Check

Aplicando `docs/contracts/canon-change-policy.md`:

- **Affected canon**: popup-contract, popup-matrix-rule,
  popup-persist-on-rebuild, contexto-cercano-inline,
  unenriched-waypoint-click-behavior, design-system-tokens-v1,
  poi-icon-single-source-of-truth.
- **Regla anterior**: popup POI = HTML string monolítico generado por
  `createPopupContent()` + React mount imperativo opcional para
  recovery; 12+ variantes implícitas; colores y SVG hardcoded.
- **Regla nueva**: popup POI = `PopupShell` React común + `body`
  polimórfico (5 canónicos), header `StatusSurface`, acciones
  `ObservableAction`, lifecycle observable, tokens + `icon-utils`
  obligatorios.
- **Componentes afectados**:
  - `src/components/map/map-popups.ts` (1201 LOC)
  - `src/components/map/map-popup-handlers.ts`
  - `src/components/map/popup-recovery-mount.ts`
  - `src/components/map/map-v2-renderer.ts`
  - `src/components/map/map-photo-layer.ts`
  - `src/components/map/LocationMap.tsx` (8+ call sites)
  - `src/hooks/use-popup-actions.ts`
  - `src/components/content/UnenrichedRecoveryBlock.tsx`
  - `src/components/content/PointContextActions.tsx`
  - `src/hooks/useEnrichmentTracker.ts`
  - `src/components/content/CollectionFocusView.tsx`
- **Migración requerida**: SÍ. Reemplazo gradual (fases §6), no
  big-bang. Coexistencia temporal HTML+React aceptada sólo durante
  fases 1–5.
- **Tests necesarios**:
  - E2E: abrir/cerrar popup para cada variante; persistencia tras
    rebuild de capa; eventos `lovable:popup-*` emitidos con `opId`.
  - Unit: `buildPopupModel(loc, ctx)` puro por variante.
  - Visual: snapshot de header `StatusSurface` por estado
    (enriched/imported/empty + health rings).
  - Contract: assertion de "no `flyTo`/`fitBounds` desde popup".
- **Riesgo si no se migra**:
  - Deriva continua de variantes (más hex hardcoded, más SVG inline).
  - Imposibilidad de instrumentar telemetría de acciones (sin `opId`).
  - Rotura silenciosa de `popup-persist-on-rebuild` en cada cambio
    de `map-popups.ts`.
  - Bloqueo del avance de design-system tokens v1 en mapa.
- **Rollout**: por fases (§6), feature-flag `popup_canon_v2` por
  variante, fallback a HTML string si el flag está off.
- **Deuda explícita fuera de scope**:
  - Home/user-location popups (no entran).
  - Popup de rutas/tracks (no entra; canon propio si aplica).
  - Refactor de `PointContextActions.tsx` (1028 LOC) más allá de lo
    necesario para alimentar `ObservableAction`.

---

## 6. Plan de migración por fases

Sin código. Sólo orden candidato. Cada fase requiere su propio
Migration Impact Check al ejecutarse.

| Fase | Nombre                          | Alcance                                                                 |
|------|---------------------------------|-------------------------------------------------------------------------|
| F0   | Ratificación canon              | Aprobar este doc; cerrar D1, D2, D3, D6.                                |
| F1   | Tokenización visual             | Sustituir hex hardcoded por tokens design-system v1 en `map-popups.ts`. |
| F2   | Status/badges canónicos         | `header` lee `getPointVisualState` + ownership; SVG vía `icon-utils`.   |
| F3   | Action model                    | Migrar botones a `ObservableAction` con `opId`; telemetría unificada.   |
| F4   | Refresh/open lifecycle          | Centralizar `openPopup` + eventos `lovable:popup-*`; reforzar `popup-persist-on-rebuild`. |
| F5   | React body                      | Sustituir `createPopupContent()` por `<PopupShell>` + bodies React; eliminar `MutationObserver` de recovery. |
| F6   | Photo popup shell               | Migrar `createPhotoPopup` a `<PhotoBody>` dentro de la shell común.     |
| F7   | Deprecación HTML string         | Borrar `createPopupContent()`, `map-v2-renderer` popup inline y branches de curator (D1). |

Cada fase: **ship behind flag → QA → promote → cleanup**.

---

## 7. Restricciones honradas

- No se ha tocado código.
- No se han movido archivos.
- No se ha cambiado UI.
- No se ha iniciado refactor.
- No se ha tocado cámara ni subset-fit.
- No se ha tocado marker grammar.
- No se han modificado specs ni assertions.

---

## 8. Próximo paso

Revisión y ratificación de §1 (canon), §3 (mapping) y §4 (decisiones
pendientes). Una vez ratificado, F0 cierra D1/D2/D3/D6 y F1 puede
abrir su propio Migration Impact Check.
