# Selection Counter — Ownership Ratios Plan

Status: PLAN ONLY · No code changes · No core/data/schema/bump.
Owner area: Discovery → FilterBar (Buscar y Filtrar).
Related: ExportPanel (PR-EXPORT-2 Fase 3B), `mem://logic/content/location-owner-resolver`, `mem://logic/sharing/curated-only-rule`.

---

## 1. Ubicación exacta del contador actual

Archivo: `src/components/FilterBar.tsx`

- **Header counter** (sin selección activa, siempre visible): líneas ~204–223.
  ```
  <span>{filteredCount}</span>
  <span>{filteredCount === stats.total ? 'ubicaciones' : `de ${stats.total} ubicaciones`}</span>
  ...
  {bucketStats.catalogTotal} catálogo · {bucketStats.workspaceTotal} mesa
  [· {bucketStats.followedTotal} seguidos]
  ```
- **Selection counter** (modo Seleccionar, líneas ~488–525):
  ```
  <span>{selectedCount}</span> seleccionados
  ```
  No muestra ratio, ni desglose ownership.

Otros consumidores que NO se tocan en esta fase pero deben permanecer coherentes:
- `FloatingToolbar.tsx` (~413–424): badge superior `myCatalogCount / catalogTotal` (mapa).
- `SelectionActions.tsx`: acciones masivas; lee `selectedLocations` directamente.

---

## 2. Datos disponibles HOY

| Dato | Fuente | Observaciones |
|---|---|---|
| `filteredLocations` | `useFilteredLocations()` | Universo lógico tras filtros + búsqueda + healthFilter. |
| `stats.total` | `useEnrichedStats()` | Total general (sin filtros). |
| `selectedLocations` | `useLocationsStore` (Set<string>) | IDs seleccionados. Cross-document. |
| `bucketStats` | `getBucketStats(filteredLocations, user.id)` | Ya devuelve `myCatalog`, `myWorkspace`, `followedCatalog`, `followedShared`, `myTotal`, `followedTotal`, `catalogTotal`, `workspaceTotal`, `total`. |
| `currentUserId` | `useAuth().user.id` | — |
| Ownership por POI | `getLocationOwnerUserId(loc) = ownerUserId ?? _docUserId` | Helper canónico ya existente. |
| Visibilidad global | `isLocationVisibleInGlobalMap` | Aplica `is_approved` + colecciones. Ya filtrado upstream en `getAllLocations`/`filteredLocations` según consumer. |

**Conclusión:** todos los datos necesarios para los ratios pedidos ya existen. No requiere nuevas queries ni cambios de store.

---

## 3. Definición real de "Míos"

Helper canónico: `isOwnedBy(loc, currentUserId)` en `src/domains/content/lib/location-owner.ts`
(equivalente a `getLocationOwnerUserId(loc) === currentUserId`).

Es la misma definición que ya usa `getBucketStats` vía `isOwnLocation` en
`src/domains/content/lib/location-bucket.ts`. **NO se redefine.**

---

## 4. Definición real de "Seguidos"

Auditoría del léxico actual:

- `getBucketStats` distingue `followedCatalog` + `followedShared` → suma `followedTotal`.
- Curated-only sharing boundary (`mem://logic/sharing/curated-only-rule`): los POIs ajenos sólo entran al pipeline si pasan `isShareablePoi`. Por tanto en la UI todo POI no-propio visible YA es "seguido/curado accesible".
- `useSocialStats` usa la palabra `following` para users, no para POIs.
- No existe concepto formal "saved" para POIs ajenos en el matcher actual.

**Decisión:** etiquetar como **"Seguidos"** (alineado con `bucketStats.followedTotal` ya en uso en el header). Definición operacional:

> POI visible en el universo actual cuyo `getLocationOwnerUserId(loc) !== currentUserId`.

Si en el futuro se introduce diferenciación `followed` vs `saved` vs `public-curated`, esta etiqueta se sub-divide sin romper el contrato del ratio total.

---

## 5. Fórmulas de cada ratio

Sea `U` = universo visible/autorizado actual = `filteredLocations`.
Sea `S` = `selectedLocations ∩ U` (selección recortada al universo visible; ver §7).

```
T  = |U|
Tm = |{ loc ∈ U : isOwnedBy(loc, uid) }|
Ts = T - Tm

X  = |S|
Xm = |{ loc ∈ S : isOwnedBy(loc, uid) }|
Xs = X - Xm
```

Invariante: `Xm + Xs === X` y `Tm + Ts === T`. (Anonymous / sin uid → todo cuenta como `Ts`.)

Computación: una sola pasada sobre `filteredLocations` (ya memoizado) + una sola pasada sobre `selectedLocations` resueltos a loc.

---

## 6. Propuesta visual (compacta, no rediseño)

Reutilizar el contenedor existente (gradient stats bar). Mantener línea grande igual; reemplazar la sub-línea cuando haya selección activa.

**Sin selección:**
```
4 739 míos · 356 seguidos · 5 095 total
```
(equivale a la línea actual `catálogo/mesa/seguidos`, pero re-encuadrada por ownership cuando el modo es Seleccionar; en modo Explorar se mantiene la actual sin cambios para no romper canon Catálogo/Mesa).

**Con selección activa:**
```
1 / 5 095 seleccionados
Míos 1 / 4 739 · Seguidos 0 / 356
```

**Sin seguidos (Ts = 0):**
```
1 / 4 739 seleccionados
Míos 1 / 4 739 · Seguidos 0 / 0
```

Tokens:
- Color `Míos` = `text-emerald-600` (consistente con catálogo propio).
- Color `Seguidos` = `text-sky-600` (consistente con badge azul de followed).
- Tipografía: `text-[11px] text-muted-foreground` para la sub-línea (idéntica a la actual).

Formato numérico: `COUNT_FORMATTER` (`Intl.NumberFormat('es-ES')`) ya disponible en el archivo.

---

## 7. Comportamiento con selección activa

- `S = selectedLocations ∩ filteredLocations` (recortado). Razón: un POI seleccionado fuera del universo filtrado no debería contar en `X / T` para evitar `X > T`.
- Si `selectedLocations.size > filteredLocations.length`, mostrar tooltip "Algunos seleccionados están fuera del filtro actual".
- Se reemplaza la línea "X seleccionados" del modo Seleccionar (§1) por el ratio extendido.
- El header counter (§1) sigue mostrando `filteredCount / stats.total`; el desglose ownership SUSTITUYE la sub-línea sólo cuando `selectedCount > 0`.

---

## 8. Comportamiento sin selección

- Header counter: sin cambios respecto a hoy (línea grande + sub-línea catálogo/mesa/seguidos).
- Opcional (modo Seleccionar): mostrar versión "global" `Tm míos · Ts seguidos · T total` para preparar la expectativa de qué se va a poder exportar.

---

## 9. Comportamiento con filtros

`U` ya respeta:
- Filtros activos (geo, tags, place-type, classification, healthFilter, búsqueda).
- `is_approved` + colecciones (vía `isLocationVisibleInGlobalMap` upstream).
- RLS server-side (vía hidratación del store).
- Exclusión de deleted (no se cargan en store).
- Sandbox mirror: usuario normal, sin trato especial (rollout policy).

⇒ El ratio refleja automáticamente cualquier cambio de filtro. No se necesita pipeline propio.

---

## 10. Comportamiento con nodos del GeographyTree

`GeographyTree` ya emite `filters.geography*` que entran en `matchesLocationFilters`, por lo que `filteredLocations` se actualiza automáticamente. **Nada nuevo.**

Si el usuario "selecciona" un nodo geográfico distinto de "filtra por", actualmente NO hay materialización a `selectedLocations`. Mantener fuera de alcance (selección viene del mapa o de `selectByFilter`).

---

## 11. Relación con ExportPanel

| Scope del ExportPanel | Universo equivalente |
|---|---|
| Interno (sólo míos) | `Xm` (si hay selección) o `Tm` |
| Míos + seguidos | `X` (si hay selección) o `T` |
| Público curado | subconjunto de POI-9/10 dentro de `X`/`T` (lo resuelve `evaluatePoiExport`, no este contador) |

El nuevo contador da al usuario el modelo mental que justifica los números del ExportPanel ("Elegibles 0 / 2" deja de parecer un bug).

ExportPanel NO se modifica en este plan. Sólo se documenta que la fuente `selection` que recibe vía source resolver coincide con `X` aquí mostrado.

---

## 12. Tests necesarios

Unitarios (`src/test/`):
1. `selection-counter-ratios.test.ts`:
   - Sin selección → ratios `T/Tm/Ts` correctos.
   - Selección 100% propia → `Xm=X, Xs=0`.
   - Selección 100% ajena → `Xm=0, Xs=X`.
   - Mixta → `Xm + Xs === X`.
   - Selección fuera de filtro → `X` recortado a `U`.
   - Anonymous (`uid=null`) → todo en `Ts`.
2. Contrato visibilidad: re-usar fixtures de `location-bucket` ya existentes.

Render (opcional, no bloqueante):
3. `FilterBar.selection-ratios.test.tsx` con RTL: aserción de strings "Míos X / Tm".

E2E: fuera de alcance.

---

## 13. Riesgos de performance

- `filteredLocations` ya está memoizado por `_docVersion + filters + currentUserId + selectedLocations`.
- Calcular `Tm/Ts/Xm/Xs` = 2 pasadas O(n) sobre n≈5k. < 1ms en práctica.
- `selectedLocations` es Set<string> → lookup O(1).
- Recomendado: añadir un `useMemo` dedicado `ownershipRatios` con deps `[filteredLocations, selectedLocations, user?.id]`. Cero coste extra fuera de cambios de filtro/selección.

Riesgo nulo. No se introducen queries nuevas.

---

## 14. Recomendación: ¿implementar ya o esperar a Fase 3B ExportPanel?

**Implementar YA**, en un PR pequeño independiente:

Pros:
- Datos disponibles, helpers canónicos en su sitio, riesgo trivial.
- Cierra el gap UX que motivó la queja ("1 de 5095 no dice nada").
- Adelanta el modelo mental que Fase 3B (presets Google/Guru + scopes) va a explotar — reduce fricción cuando aterrice.
- No bloquea ni se solapa con cambios del ExportPanel (sólo lee `bucketStats`/ownership; no toca core export ni `ExportSource`).

Contras:
- Si Fase 3B redefine "seguidos" como `followed vs saved vs public`, habrá que sub-dividir la etiqueta. Coste futuro: ~10 líneas.

**Decisión propuesta:** ship contador en PR aislado tras aprobación; Fase 3B continúa en paralelo sin acoplamiento.

---

## Fuera de alcance

- Cambios en core PR-EXPORT-2 (`evaluatePoiExport`, `POI_EXPORTERS`).
- Cambios en `ShareSheet` o boundary share-vs-export.
- Cambios en schema, RLS, datos, edge functions.
- Nueva semántica "saved" / "authorized" / "public-curated" (se documentará cuando aplique).
- Materializar POIs desde nodos no marcados del GeographyTree.
- Bump de versión.
