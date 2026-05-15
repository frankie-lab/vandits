# Structural Risk Priority

_Doc-only. No code changes. Synthesis sobre los inventarios exhaustivos de la segunda pasada._

Inputs:
- `event-bus-inventory.md` (185 emisiones, 428 listeners, 165 nombres únicos)
- `ownership-resolution-inventory.md` (599 ocurrencias, 6 variantes `isOwn*`)
- `constants-thresholds-inventory.md` (5 buses paralelos de cámara)
- `hardcode-inventory.md`, `uniformity-audit.md`, `hardcoded-behaviors-audit.md`

---

## Clasificación

### Tier 1 — Riesgo sistémico (atacar primero)

| ID | Finding | Backlog actual |
|---|---|---|
| **T1-A** | Coexistencia de 5 buses paralelos de cámara | BL-002, BL-015 |
| **T1-B** | Ownership con resolver canónico ignorado en N callsites | BL-014 |
| **T1-C** | Event bus sin namespacing, sin contratos, sin registry | BL-018 |

### Tier 2 — Divergencia importante

| ID | Finding | Backlog actual |
|---|---|---|
| T2-A | 6 variantes léxicas `isOwn*` sin helper booleano único | candidate BL-022 |
| T2-B | 4–5 eventos redundantes para "recargar locations" (`locations-updated`, `locations:changed`, `locations:refresh`, `reload-locations`, `location-realtime-update`, `store-updated`) | candidate BL-023 |
| T2-C | Posible divergencia `created_by` (RLS/DB) vs `ownerUserId` (UI) | candidate BL-024 |
| T2-D | Listeners Leaflet con `on` > `off` por archivo (riesgo stale-closure) | BL-007 |
| T2-E | `currentUserId` propagado por props ×163 en lugar de hook único | parcial BL-014 |

### Tier 3 — Deuda localizada

| ID | Finding | Backlog actual |
|---|---|---|
| T3-A | Padding de cámara sin nombrar (`[24,24]`/`[50,50]`/`[60,60]`/`[80,80]`) | BL-017 |
| T3-B | `setTimeout` con valores mágicos (250 / 400 / 500 / 1000 / 4000) ×71 | BL-017, BL-018 |
| T3-C | Zoom thresholds repetidos (`maxZoom: 14` ×4, zoom inline `12/14/16`) | BL-017 |
| T3-D | `localStorage` keys sin centralizar ×76 | BL-016 |
| T3-E | Bypasses zoom-gates en `applyLayerVisibility` con flags ad-hoc | parcial BL-015 |

### Tier 4 — Cleanup cosmético (NO atacar ahora)

| ID | Finding |
|---|---|
| T4-A | Hex colors residuales fuera de tokens (BL-020) |
| T4-B | `palette_version='owner-v2.6-no-green-no-gray'` como string literal |
| T4-C | UUIDs de sandbox no extraídos a constante |
| T4-D | Magic strings de canal de import (`web_import`, `kml`, `gpx`...) duplicados |
| T4-E | `opacity:` / `zIndex:` literales en componentes |

---

## Tier 1 — análisis detallado

### T1-A · Sistemas paralelos de cámara

**Ownership map (estado actual):**

```text
                       ┌─────────────────────────────────────┐
                       │          intención: "ver X"          │
                       └─────────────────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬────────────────┐
        ▼              ▼               ▼               ▼                ▼
 requestSubsetFit  map-fit-bounds  map.fitBounds   map.flyTo        map.setView
 (canónico)        (window event)  (directo)       (directo)        (directo)
        │              │               │               │                │
        │              │               │               │                │
        ▼              ▼               ▼               ▼                ▼
 ┌──────────┐    ┌──────────┐     ┌────────┐     ┌────────┐       ┌────────┐
 │ cooldown │    │ NO guard │     │NO guard│     │NO guard│       │NO guard│
 │ clamp z12│    │ NO clamp │     │NO clamp│     │NO clamp│       │NO clamp│
 │ if-outside│   │payload   │     │padding │     │zoom    │       │zoom    │
 │ 40%      │    │inconsist │     │inline  │     │inline  │       │inline  │
 └──────────┘    └──────────┘     └────────┘     └────────┘       └────────┘
        │              │               │               │                │
        └──────────────┴───────────────┴───────────────┴────────────────┘
                                       ▼
                              Leaflet map instance
```

**Callers por bus:**

| Bus | Callers | Estado |
|---|---|---|
| `requestSubsetFit` | HealthRepairPreviewDialog, use-health-filter-fit, use-selection-fit-on-start, use-my-catalog-popover-fit, UsersSidebar, SourceFilterBridge | **CANÓNICO** |
| `map-fit-bounds` (window event) | Index.tsx ×2, use-route-focus-bus ×2, SegmentBreakdown, CollectionFocusView, DocumentFocusView, DocumentContentManager, DocumentsPanel, OrphanFocusView, DuplicatesList | **LEGACY/BYPASS** |
| `map.fitBounds` directo | LocationMap ×7, map-routes ×3, UploadPreviewDialog ×1 | LEGACY/internal |
| `map.flyTo` directo | LocationMap ×7 | LEGACY/internal |
| `map.setView` directo | LocationMap ×6, useEnrichmentTracker, UploadPreviewDialog | LEGACY/internal + boot |
| `map.panTo` | LocationMap:1798 (popup recenter) | aceptable (no es "fit") |
| `centerOpenedPopupInVisibleMap` | LocationMap ×4 | aceptable (popup recenter, no fit) |

**Flujo canónico deseado:**

```text
caller (cualquier consola, panel, sidebar)
        │
        │  requestSubsetFit(ids|bounds|coords, { mode, reason, padding?, maxZoom? })
        ▼
src/components/map/subset-fit.ts
        │  - cooldown manual 4s
        │  - clamp z12
        │  - umbral if-outside 40%
        │  - reasons whitelisted
        ▼
listener único en LocationMap.tsx
        │
        ▼
map.fitBounds(...)   ← única llamada Leaflet directa para "fit"
```

`flyTo`/`setView` quedan permitidos solo para:
- Boot/initial geolocation (`INITIAL_GEOLOCATION_ZOOM`).
- Popup recenter via `centerOpenedPopupInVisibleMap` (no es fit).
- "Go home" / "locate me" (botones explícitos del usuario).

**Impacto real:**
- Caso negativo del subset-fit-contract NO está cubierto: `flyTo` directo desde código (no gesture) bypassa el cooldown y rompe BL-003.
- Cada PR que añade un panel nuevo elige bus según copy-paste del vecino → la deuda crece monotónicamente.
- Imposible escribir un test E2E del cooldown porque hay 5 caminos.

**Contratos afectados:**
- `subset-fit-contract` (definido pero no enforced).
- `popup-contract` (depende de `centerOpenedPopupInVisibleMap` quedando intacto).
- `danger-zones` en `LocationMap.tsx` (líneas 501, 637, 807, 843, 845, 949, 1551, 2307, 2440, 2465).

**Regressions históricas:**
- BL-003 (popover Mis POI no encuadraba) — causa raíz: cooldown manual aplicado sin distinguir `mode:'always'` vs `mode:'if-outside'`. Resuelto en código, `pending-manual-qa`.
- BL-002 (cooldown subset-fit) — abierto.
- Bug histórico de cámara saltando al cambiar de tab: causado por listener `move/zoomstart` capturando flyTo programáticos como gesture.

**Riesgo de refactor:**
- **ALTO**. `LocationMap.tsx` tiene 14+ callsites Leaflet directos entrelazados con popup, focus, edición de waypoints, geolocation, route preview. Cualquier unificación toca código en producción crítica.
- Bajo desde `map-fit-bounds`: 10 emisores, payload similar, conversión mecánica a `requestSubsetFit`.

**Estrategia propuesta:**

1. **FREEZE**. Añadir lint rule (eslint-plugin local) que prohíba `new CustomEvent('map-fit-bounds'` y `mapRef.current.fitBounds(` fuera de `subset-fit.ts` + `LocationMap` listener. PRs nuevos no pueden empeorar la deuda.
2. **DEPRECATE `map-fit-bounds`**. Migrar los 10 emisores 1-a-1 a `requestSubsetFit` con `reason` específico (`route-focus`, `collection-focus`, `document-focus`, `orphan-focus`, `duplicates-focus`, `segment-focus`). Eliminar listener `map-fit-bounds` en `LocationMap.tsx:355`.
3. **ISOLATE Leaflet directos**. Clasificar los 14+ callsites en `LocationMap` como (a) gesture-driven boot, (b) popup recenter, (c) "fit semántico" disfrazado. Solo (c) migra a `requestSubsetFit`. (a) y (b) reciben helpers nombrados (`bootMapToHome`, `recenterPopup`).
4. **UNIFY**. Una vez migrados, el cooldown/clamp se aplica universalmente. Test E2E pasa a ser viable (BL-012).

---

### T1-B · Ownership resolution

**Definición canónica única (estado actual, según core memory):**

```ts
// src/domains/content/lib/location-owner.ts
getLocationOwnerUserId(loc) = loc.ownerUserId ?? loc._docUserId
// _docUserId es FALLBACK LEGACY, no fuente preferida.
```

**Bypasses detectados (según `ownership-resolution-inventory.md` §2):**

Cualquier callsite que lea `loc.ownerUserId` o `loc._docUserId` directamente sin pasar por el helper. Inventario filtrado a productores/lectores: 90 ocurrencias entre `ownerUserId` (67) y `_docUserId` (23). El helper se usa solo en 23 sitios → **al menos ~67 lecturas no canónicas**.

**Top archivos con accesos directos a `_docUserId`** (riesgo de divergencia inmediata):
- `src/components/LocationMap.tsx` — bypass histórico documentado en BL-014.
- `src/domains/content/lib/location-owner.ts` — definición (esperado).
- Resto: ver tabla §2 del inventario para fila exacta.

**Variantes léxicas de "es mío":**

| Variante | Count | Riesgo |
|---|---|---|
| `isOwn` | 107 | base |
| `isOwnPoi` | 6 | aplica a POIs |
| `isOwnPoint` | 4 | sinónimo de POI |
| `isOwnLocation` | 2 | sinónimo |
| `isOwnDoc` | 2 | aplica a documentos |
| `isOwnedBy` | 1 | función |

**Sin helper booleano único.** Cada componente decide qué cuenta como "propio" → semántica deriva.

**Posible divergencia `created_by` (DB) vs `ownerUserId` (UI):**
- 18 ocurrencias `created_by`. RLS probablemente filtra por `created_by`. UI lee `ownerUserId`. Si una migración antigua dejó `ownerUserId NULL` con `created_by` poblado, la UI ve "huérfano" y RLS ve "tuyo". No verificado en esta pasada.

**Impacto real:**
- Filtro `filterByUserId` (eje canónico, 39 usos) se basa en el helper. Si callsites bypass leen `ownerUserId` raw, el conteo de buckets (`getBucketStats`) puede divergir del conjunto pintado.
- Identidad cromática (PR-OWNER-IDENTITY-2.6) depende del helper para asignar triángulo y color.

**Contratos afectados:**
- `mem://logic/content/location-owner-resolver`.
- `mem://logic/content/location-bucket-matrix`.
- `mem://style/map/followed-poi-grammar`.

**Regressions históricas:**
- BL-014 (LocationMap bypass) — `_docUserId` accedido directo.
- Discrepancia conteo verde/azul en FloatingToolbar cuando filtro por usuario activo (resuelta vía `getBucketStats(subset)`).

**Riesgo de refactor:**
- **MEDIO**. El helper existe. Es una migración mecánica de N callsites. El riesgo está en `isOwn*`: requiere análisis caso-por-caso para confirmar que las 6 variantes piden lo mismo.

**Estrategia propuesta:**

1. **FREEZE**. Lint rule: prohibir lectura directa de `loc.ownerUserId` y `loc._docUserId` fuera de `src/domains/content/lib/`. Forzar `getLocationOwnerUserId(loc)`.
2. **UNIFY booleano**. Crear `isOwnedByMe(loc, currentUserId)` y `isOwnedBy(loc, userId)` en el mismo archivo. Migrar las 6 variantes `isOwn*`.
3. **VERIFY DB**. Comprobar relación `created_by` vs `ownerUserId` en la tabla `locations`/`places`/`waypoints` (read-only query). Si hay rows con `ownerUserId IS NULL AND created_by IS NOT NULL`, es bug de datos, no de código. Decisión post-verificación.
4. **HOOK único**. Reemplazar prop drilling de `currentUserId` por `useCurrentUserId()` consumiendo `auth` store. Reduce las 163 ocurrencias drásticamente.

---

### T1-C · Event bus global

**Estado actual:**
- 185 emisiones, 428 listeners, 165 nombres únicos.
- 7 namespaces distintos: `lovable:*`, `vandits:*`, `admin:*`, `document:*`, `map-*`, `map:*`, sin namespace (`routes:*`, `locations:*`, `collections:*`, `trash-updated`, `store-updated`, `reload-locations`, `photo-updated`, …).
- Sin registry central. Sin contrato de payload. Sin tipado TS de los `detail`.

**Listeners sin cleanup** (heurística: nombre con `addEventListener` y sin `removeEventListener` correspondiente en el mismo archivo o en cualquier otro): tabla §5 del `event-bus-inventory.md`. Cubre eventos clave como varios `*-updated` y algunos `map-*`.

**Eventos redundantes (semánticos)** — probablemente piden lo mismo:

| Cluster | Eventos | Hipótesis |
|---|---|---|
| Recarga de locations | `locations-updated`, `locations:changed`, `locations:refresh`, `reload-locations`, `location-realtime-update`, `store-updated` | mismo intent: "refresca el set de locations" |
| Updates colaterales | `trash-updated`, `photo-updated`, `notes-updated`, `rating-updated`, `visited-updated`, `collections-updated`, `collections:changed`, `collection-items-changed`, `routes:changed` | cada dominio emite el suyo + alguien escucha "refresca todo" |
| Map render mode | `map-render-mode-changed` ×2 | OK, nombre único |
| Insert preview | `map-show-insert-preview` / `map-hide-insert-preview` ×3 | OK, par claro |
| Segment correction | `map-segment-correction-start`, `map-segment-corrected`, `map-segment-correction-error` ×múltiple | OK, FSM clara |

**Eventos sin contrato (payload variable):**
- `map-fit-bounds`: `{bounds, padding, maxZoom}` vs `{bounds, padding}` vs `{detail:{bounds, ...}}`. Padding `[24,24]` / `[50,50]` / `[60,60]` / `[80,80]`. **Único bus con divergencia de payload severa.**
- `map-fly-to`: payload no validado en esta pasada.
- `open-nearby-context`, `nearby-marker-clicked`: sospechosos pero no medidos.

**Impacto real:**
- Cualquier rename de evento rompe consumidores silenciosamente (no hay tipado).
- `*-updated` redundantes provocan refetches encadenados → carga DB innecesaria + jitter UI.
- Listeners sin cleanup ⇒ memory leak en componentes que re-montan + handlers ejecutándose dos veces (visto históricamente en `popupopen`).

**Contratos afectados:**
- `mem://architecture/event-bus-ui-sync` (define el patrón pero no enforced).
- `subset-fit-contract` (en parte, vía `map-fit-bounds`).

**Regressions históricas:**
- Doble fetch de locations al abrir/cerrar trash + agregar collection (cluster "Recarga de locations" disparando 3 buses).
- Listener `popupopen` duplicado tras hot-reload (BL-007 lo cubre).

**Riesgo de refactor:**
- **ALTO**. 165 nombres × N listeners. No se puede hacer big-bang. Requiere registry incremental.

**Estrategia propuesta:**

1. **FREEZE**. Lint rule: cualquier `new CustomEvent` y `window.addEventListener` debe importar el nombre desde `src/shared/events/registry.ts`. PRs nuevos no añaden strings sueltos.
2. **REGISTRY incremental**. Crear `src/shared/events/registry.ts` con tipado:
   ```ts
   export type AppEvents = {
     'lovable:owner-identity-updated': { uid: string; oklch: string };
     'map-fit-bounds': { bounds: LatLngBounds; padding: [number,number]; maxZoom?: number };
     // …
   };
   export const emit = <K extends keyof AppEvents>(name: K, detail: AppEvents[K]) => {…};
   export const on  = <K extends keyof AppEvents>(name: K, handler: (e: CustomEvent<AppEvents[K]>) => void) => {…};
   ```
   Migración 1-evento-por-PR. Empezar por los high-traffic: `map-fit-bounds`, `lovable:*`, `locations:*`.
3. **DEPRECATE cluster "Recarga de locations"**. Elegir un único evento (`locations:invalidate` p.ej.) y migrar consumidores. Eliminar los 5 sinónimos.
4. **AUDIT cleanup**. Cada PR que añada listener debe demostrar `removeEventListener` simétrico. Lint rule custom (AST: `addEventListener` sin `useEffect` cleanup return).

---

## Resumen ejecutivo

| Tier | Findings | Estrategia base | Bloquea progreso de |
|---|---|---|---|
| **T1** | 3 (cámara, ownership, event bus) | freeze + lint + migración 1-a-1 | T2 entera |
| **T2** | 5 (variantes isOwn, eventos `*-updated`, `created_by`, listeners cleanup, currentUserId) | unify tras T1 | T3 |
| **T3** | 5 (paddings, timeouts, zooms, localStorage, zoom gates) | constants file | nada crítico |
| **T4** | 5 (hex, palette literal, UUID, channels, opacity/zIndex) | codemod cosmético | nada |

**Decisión recomendada:**
- Atacar T1-A primero (cámara). Beneficio inmediato: cierra BL-002, BL-003, BL-012, BL-015 de un golpe.
- T1-B en paralelo si recursos lo permiten (es independiente).
- T1-C requiere infraestructura (registry) antes de migrar — empezar registry vacío en una PR pequeña.
- T2/T3/T4 quedan **bloqueados** explícitamente hasta cerrar T1.

## Cross-references

- Inventarios: `event-bus-inventory.md`, `ownership-resolution-inventory.md`, `constants-thresholds-inventory.md`, `hardcode-inventory.md`.
- Audits previos: `uniformity-audit.md` (U1–U11), `hardcoded-behaviors-audit.md`, `global-guards-audit.md`, `stale-closures-audit.md`, `duplicate-listeners-audit.md`.
- Backlog: `backlog.md` BL-002, BL-003, BL-007, BL-012, BL-014, BL-015, BL-016, BL-017, BL-018.
- Memory: `mem://logic/map/subset-fit-contract`, `mem://logic/content/location-owner-resolver`, `mem://architecture/event-bus-ui-sync`.
